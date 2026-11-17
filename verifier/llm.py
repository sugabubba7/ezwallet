"""One chat-completion call against any OpenAI-compatible endpoint (OpenRouter, OpenAI, Groq, Gemini's /openai).

Failures are classified by the same code as the A2 tracker (tracker/http_errors.py): per-minute 429 and 5xx are
transient, a bad key or an exhausted daily quota is terminal.
"""
import os
import re

import httpx

from tracker.http_errors import TRANSPORT_ERRORS, raise_for_service, transport_error
from tracker.errors import TransientError


class ChatLLM:
    def __init__(self, base_url: str, api_key: str, model: str, client: httpx.Client | None = None):
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.key, self.model = api_key, model
        self.client = client or httpx.Client()

    @classmethod
    def from_env(cls) -> "ChatLLM":
        missing = [n for n in ("VERIFIER_LLM_BASE_URL", "VERIFIER_LLM_API_KEY", "VERIFIER_LLM_MODEL") if not os.environ.get(n)]
        if missing:
            raise RuntimeError(f"missing environment variable(s): {', '.join(missing)}")
        return cls(os.environ["VERIFIER_LLM_BASE_URL"], os.environ["VERIFIER_LLM_API_KEY"], os.environ["VERIFIER_LLM_MODEL"])

    def complete(self, system: str, user: str, *, timeout_s: float, max_output_tokens: int) -> tuple[str, int]:
        """Returns (text, total_tokens). Raises Transient/RateLimited/Terminal errors."""
        body = {"model": self.model, "temperature": 0, "max_tokens": max_output_tokens,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        try:
            r = self.client.post(self.url, json=body, headers={"Authorization": f"Bearer {self.key}"}, timeout=max(1.0, timeout_s))
        except TRANSPORT_ERRORS as e:
            raise transport_error("model", e) from e
        except httpx.TimeoutException as e:
            raise TransientError(f"model: timed out ({type(e).__name__})") from e
        raise_for_service("model", r)
        data = r.json()
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise TransientError("model: malformed response") from e
        usage = data.get("usage") or {}
        tokens = usage.get("total_tokens") or (usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0))
        if not tokens:
            tokens = (len(system) + len(user) + len(text)) // 4
        return text, int(tokens)


_JSON = re.compile(r"\{.*\}", re.S)


def parse_json_object(text: str) -> dict | None:
    """Pull the first JSON object out of a model reply (it may be fenced or have chatter around it)."""
    import json
    m = _JSON.search(text or "")
    if not m:
        return None
    try:
        out = json.loads(m.group(0))
    except ValueError:
        return None
    return out if isinstance(out, dict) else None
