"""Model clients over plain REST (no agent framework). The agent keeps a provider-neutral history;
each client converts it to its own wire format and parses tool calls and token usage back out.

History entries:  {"role":"user","text"} | {"role":"model","calls":[(id,name,args)],"raw","text"} |
                  {"role":"tool","results":[{"id","name","response"}]}
"""
import json
from dataclasses import dataclass, field

import httpx

from .config import Config, need_env
from .errors import TransientError
from .http_errors import TRANSPORT_ERRORS, raise_for_service, transport_error


@dataclass
class LlmResult:
    calls: list[tuple[str, dict]] = field(default_factory=list)
    call_ids: list[str] = field(default_factory=list)
    raw: object = None
    text: str = ""
    prompt_tokens: int = 0
    output_tokens: int = 0
    finish_reason: str = ""


def _post(client: httpx.Client, service: str, url: str, headers: dict, body: dict) -> httpx.Response:
    try:
        resp = client.post(url, json=body, headers=headers)
    except TRANSPORT_ERRORS as e:
        raise transport_error(service, e) from e
    except httpx.TimeoutException as e:
        raise TransientError(f"{service}: timed out ({type(e).__name__})") from e
    return resp


def _json_schema(node):
    """Gemini-style declarations use upper-case types; OpenAI-style wants JSON Schema."""
    if isinstance(node, dict):
        return {k: (v.lower() if k == "type" and isinstance(v, str) else _json_schema(v)) for k, v in node.items()}
    if isinstance(node, list):
        return [_json_schema(x) for x in node]
    return node


class Gemini:
    BASE = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, cfg: Config, client: httpx.Client | None = None):
        self.cfg, self.client = cfg, client or httpx.Client(timeout=90)

    def _contents(self, history: list[dict]) -> list[dict]:
        out = []
        for h in history:
            if h["role"] == "user":
                out.append({"role": "user", "parts": [{"text": h["text"]}]})
            elif h["role"] == "model":
                out.append(h["raw"])  # echoed verbatim so thought signatures survive
            else:
                out.append({"role": "user", "parts": [{"functionResponse": {"name": r["name"], "response": r["response"]}} for r in h["results"]]})
        return out

    def generate(self, system: str, history: list[dict], declarations: list[dict], allowed: list[str]) -> LlmResult:
        key = need_env("GEMINI_API_KEY")
        gen: dict = {"temperature": self.cfg.temperature, "maxOutputTokens": self.cfg.max_output_tokens}
        if self.cfg.thinking_budget is not None:
            gen["thinkingConfig"] = {"thinkingBudget": self.cfg.thinking_budget}
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._contents(history),
            "tools": [{"functionDeclarations": declarations}],
            # ANY = the model must answer with a tool call, so a runtime-controlled tool is always the next step.
            "toolConfig": {"functionCallingConfig": {"mode": "ANY", "allowedFunctionNames": allowed}},
            "generationConfig": gen,
        }
        resp = _post(self.client, "gemini", f"{self.BASE}/{self.cfg.model_name}:generateContent", {"x-goog-api-key": key}, body)
        raise_for_service("gemini", resp)
        data = resp.json()
        usage = data.get("usageMetadata", {})
        pt = int(usage.get("promptTokenCount", 0))
        ot = int(usage.get("candidatesTokenCount", 0)) + int(usage.get("thoughtsTokenCount", 0))
        cands = data.get("candidates") or []
        if not cands:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
            return LlmResult(raw={"role": "model", "parts": [{"text": ""}]}, finish_reason=str(reason), prompt_tokens=pt, output_tokens=ot)
        cand = cands[0]
        content = cand.get("content") or {"role": "model", "parts": []}
        content.setdefault("role", "model")
        calls, ids, text = [], [], ""
        for i, part in enumerate(content.get("parts", [])):
            if "functionCall" in part:
                fc = part["functionCall"]
                calls.append((str(fc.get("name", "")), dict(fc.get("args") or {})))
                ids.append(f"g{i}")
            elif "text" in part and not part.get("thought"):
                text += part["text"]
        if not content.get("parts"):
            content["parts"] = [{"text": ""}]
        return LlmResult(calls=calls, call_ids=ids, raw=content, text=text, finish_reason=str(cand.get("finishReason", "")),
                         prompt_tokens=pt, output_tokens=ot)


# OpenAI-compatible chat-completions providers (Groq, OpenRouter, OpenAI): name -> (base url, key env var)
OPENAI_COMPAT = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
    "openai": ("https://api.openai.com/v1", "OPENAI_API_KEY"),
}


class OpenAICompat:
    def __init__(self, cfg: Config, provider: str, client: httpx.Client | None = None):
        self.cfg, self.provider = cfg, provider
        self.base, self.key_env = OPENAI_COMPAT[provider]
        self.client = client or httpx.Client(timeout=90)

    def _messages(self, system: str, history: list[dict]) -> list[dict]:
        msgs: list[dict] = [{"role": "system", "content": system}]
        for h in history:
            if h["role"] == "user":
                msgs.append({"role": "user", "content": h["text"]})
            elif h["role"] == "model":
                m: dict = {"role": "assistant", "content": h.get("text") or None}
                if h["calls"]:
                    m["tool_calls"] = [{"id": cid, "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for cid, n, a in h["calls"]]
                msgs.append(m)
            else:
                msgs += [{"role": "tool", "tool_call_id": r["id"], "content": json.dumps(r["response"])} for r in h["results"]]
        return msgs

    def generate(self, system: str, history: list[dict], declarations: list[dict], allowed: list[str]) -> LlmResult:
        key = need_env(self.key_env)
        tools = [{"type": "function", "function": {"name": d["name"], "description": d["description"], "parameters": _json_schema(d["parameters"])}}
                 for d in declarations]
        choice = {"type": "function", "function": {"name": allowed[0]}} if len(allowed) == 1 else "required"
        body = {"model": self.cfg.model_name, "messages": self._messages(system, history), "tools": tools, "tool_choice": choice,
                "temperature": self.cfg.temperature, "max_tokens": self.cfg.max_output_tokens}
        if self.cfg.reasoning_effort:
            body["reasoning_effort"] = self.cfg.reasoning_effort
        resp = _post(self.client, self.provider, f"{self.base}/chat/completions", {"Authorization": f"Bearer {key}"}, body)
        if resp.status_code == 400 and "tool_use_failed" in resp.text:
            # The model produced a tool call the provider could not parse (gpt-oss sometimes wraps it as
            # {"name": "commentary", "arguments": {...}} or emits bare JSON). The arguments are usually intact in
            # `failed_generation`, so recover them; the runtime validates them like any other call.
            try:
                gen = str(resp.json().get("error", {}).get("failed_generation", ""))
            except ValueError:
                gen = ""
            call = _recover_call(gen, allowed)
            if call:
                return LlmResult(calls=[call], call_ids=["recovered0"], raw=None, finish_reason="tool_calls (recovered from failed_generation)")
            return LlmResult(raw=None, finish_reason=f"tool_use_failed {gen[:300]!r}")
        raise_for_service(self.provider, resp)
        data = resp.json()
        usage = data.get("usage") or {}
        choice0 = (data.get("choices") or [{}])[0]
        msg = choice0.get("message") or {}
        calls, ids = [], []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            try:
                # strict=False: some models put raw line breaks inside string values
                args = json.loads(fn.get("arguments") or "{}", strict=False)
            except ValueError:
                args = {"_unparsed_arguments": str(fn.get("arguments"))[:20000]}
            calls.append((str(fn.get("name", "")), args if isinstance(args, dict) else {}))
            ids.append(str(tc.get("id") or f"c{len(ids)}"))
        return LlmResult(calls=calls, call_ids=ids, text=msg.get("content") or "", finish_reason=str(choice0.get("finish_reason", "")),
                         prompt_tokens=int(usage.get("prompt_tokens", 0)), output_tokens=int(usage.get("completion_tokens", 0)))


def _recover_call(generation: str, allowed: list[str]) -> tuple[str, dict] | None:
    """Pull a tool call out of a provider's 'failed_generation' text, or None if it is not clearly one."""
    try:
        data = json.loads(generation.strip())
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    args = data.get("arguments", data)
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            return None
    if not isinstance(args, dict):
        return None
    name = data.get("name") if data.get("name") in allowed else None
    if name is None:  # infer from the argument names
        for tool, key in (("finish", "report"), ("finish", "developments"), ("search_web", "query"), ("fetch_article", "url")):
            if key in args and tool in allowed:
                name = tool
                break
    return (name, args) if name else None


def make_llm(cfg: Config):
    if cfg.provider == "gemini":
        return Gemini(cfg)
    if cfg.provider in OPENAI_COMPAT:
        return OpenAICompat(cfg, cfg.provider)
    raise ValueError(f"config.yaml: unknown model.provider '{cfg.provider}' (use gemini, groq, openrouter or openai)")
