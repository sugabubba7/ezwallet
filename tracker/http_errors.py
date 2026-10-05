"""Turn an HTTP response (or transport exception) into a Transient or Terminal error."""
import json
import re

import httpx

from .errors import (
    AuthError,
    BadRequest,
    DailyQuotaExhausted,
    PaymentRequired,
    RequestTooLarge,
    RateLimited,
    TerminalError,
    TransientError,
)

TRANSPORT_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.NetworkError,
)


def transport_error(service: str, exc: Exception) -> TransientError:
    return TransientError(f"{service}: network problem ({type(exc).__name__}: {exc})")


def _retry_after(resp: httpx.Response, body_text: str) -> float | None:
    h = resp.headers.get("retry-after")
    if h:
        try:
            return float(h)
        except ValueError:
            pass
    m = re.search(r'"retryDelay"\s*:\s*"([\d.]+)s"', body_text)  # Gemini RetryInfo
    return float(m.group(1)) if m else None


def _short(body_text: str) -> str:
    try:
        msg = json.loads(body_text)
        msg = msg.get("error", msg)
        msg = msg.get("message") or msg.get("detail") or msg
    except (ValueError, AttributeError):
        msg = body_text
    return str(msg).replace("\n", " ")[:200]


def raise_for_service(service: str, resp: httpx.Response) -> None:
    """Raise the right error for a non-2xx response; return None for success."""
    if resp.status_code < 400:
        return
    code = resp.status_code
    body = resp.text or ""
    low = body.lower()
    why = _short(body)

    if code == 429:
        # A per-day / per-plan cap looks like a 429 but will not clear for hours.
        # Gemini names the exhausted quota (e.g. "...PerDay...") in the body.
        if "perday" in low or "per day" in low or "daily" in low:
            raise DailyQuotaExhausted(f"{service}: daily quota exhausted ({why}). Retrying will not help; try again tomorrow.")
        raise RateLimited(f"{service}: rate limited ({why})", retry_after=_retry_after(resp, body))
    if code in (432, 433):  # Tavily: plan / pay-as-you-go limit exceeded
        raise DailyQuotaExhausted(f"{service}: plan usage limit exceeded ({why}).")
    if code == 413:
        m = re.search(r"Limit (\d+), Requested (\d+)", body)
        raise RequestTooLarge(f"{service}: request too large ({why})", int(m.group(1)) if m else None, int(m.group(2)) if m else None)
    if code == 402:
        raise PaymentRequired(f"{service}: payment required ({why}).")
    if code in (401, 403) or (code == 400 and ("api key not valid" in low or "api_key_invalid" in low)):
        raise AuthError(f"{service}: the API key was rejected ({code}: {why}). Check your .env.local.")
    if code in (408, 425) or code >= 500:
        raise TransientError(f"{service}: server error {code} ({why})", retry_after=_retry_after(resp, body))
    if code == 404 and service.startswith("gemini"):
        raise BadRequest(f"{service}: model not found ({why}). Check `model.name` in config.yaml.")
    raise BadRequest(f"{service}: request rejected {code} ({why})")


__all__ = ["raise_for_service", "transport_error", "TRANSPORT_ERRORS", "TerminalError"]
