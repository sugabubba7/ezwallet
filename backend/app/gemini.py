"""Zero-data-retention proxy to the Gemini REST API.

Design:
* The request is assembled in local variables only and sent straight to
  generativelanguage.googleapis.com. Nothing is logged, cached or written
  to disk.
* The API key travels in the `x-goog-api-key` header (never in the URL, so
  it cannot leak into proxy/access logs).
* After the call, every reference to the prompt, context and payload is
  dropped and a GC pass is forced (see `scrub`). Python strings are
  immutable, so this is best-effort memory hygiene, not a hard guarantee.
* Provider-side retention is governed by your Google Cloud project settings;
  see README "Zero data retention".
"""
import gc
import time
from dataclasses import dataclass

import httpx

from .config import get_settings

SYSTEM_INSTRUCTION = (
    "You are a helpful assistant. The user may attach a private context card from their "
    "encrypted data wallet. Use it only to answer the current request, and do not repeat "
    "sensitive details unless they are needed for the answer."
)


class GeminiNotConfigured(Exception):
    pass


class GeminiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class GeminiResult:
    text: str
    prompt_tokens: int | None
    output_tokens: int | None
    latency_ms: int


def build_contents(
    prompt: str,
    context: str | None,
    context_label: str | None,
    history: list[tuple[str, str]] | None = None,
) -> list[dict]:
    """Earlier turns (client-held transcript) followed by the new user turn.

    The context card is attached to the newest turn only, so it is sent
    exactly when the user chose to attach it.
    """
    contents: list[dict] = [{"role": role, "parts": [{"text": text}]} for role, text in (history or [])]
    parts: list[dict] = []
    if context:
        parts.append({"text": f"[Wallet context card: {context_label}]\n{context}\n[End of context card]"})
    parts.append({"text": prompt})
    contents.append({"role": "user", "parts": parts})
    return contents


def scrub(*containers: object) -> None:
    """Empty mutable containers in place, then force a collection pass."""
    for c in containers:
        if isinstance(c, (dict, list, bytearray)):
            c.clear()
    gc.collect()


def generate(contents: list[dict], model: str | None = None) -> GeminiResult:
    s = get_settings()
    if not s.gemini_api_key:
        raise GeminiNotConfigured()
    model = model or s.gemini_model
    url = f"{s.gemini_api_base}/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": contents,
    }
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=s.gemini_timeout_seconds) as client:
            resp = client.post(
                url,
                json=payload,
                headers={"x-goog-api-key": s.gemini_api_key, "Cache-Control": "no-store"},
            )
    except httpx.HTTPError as exc:
        raise GeminiError(f"Could not reach Gemini: {type(exc).__name__}") from None
    finally:
        scrub(payload)
    latency_ms = int((time.perf_counter() - started) * 1000)

    if resp.status_code != 200:
        try:
            msg = resp.json().get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        raise GeminiError(msg or f"Gemini returned HTTP {resp.status_code}", resp.status_code)

    data = resp.json()
    try:
        candidate = data["candidates"][0]
        text = "".join(p.get("text", "") for p in candidate["content"]["parts"])
    except (KeyError, IndexError, TypeError):
        reason = (data.get("promptFeedback") or {}).get("blockReason") or "empty response"
        raise GeminiError(f"Gemini returned no content ({reason})") from None
    usage = data.get("usageMetadata") or {}
    result = GeminiResult(
        text=text,
        prompt_tokens=usage.get("promptTokenCount"),
        output_tokens=usage.get("candidatesTokenCount"),
        latency_ms=latency_ms,
    )
    scrub(data)
    return result
