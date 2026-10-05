"""fetch_article: guarded, size-limited, redirect-checked, SSRF-safe page fetch."""
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import httpx

from .config import FetchPolicy
from .dedupe import canonical_url, content_hash
from .errors import ArticleError, GuardError, TransientError
from .extract import html_to_text, plain_to_text
from .guard import Target, check_url
from .http_errors import TRANSPORT_ERRORS, raise_for_service

_OK_TYPES = ("text/html", "application/xhtml+xml", "text/plain", "text/markdown", "application/xml", "text/xml")


def _pinned(t: Target) -> tuple[str, dict, dict]:
    """URL aimed at the validated IP, with Host/SNI kept as the real hostname."""
    from urllib.parse import urlsplit

    p = urlsplit(t.url)
    ip = f"[{t.ip}]" if ":" in t.ip else t.ip
    default = 443 if t.scheme == "https" else 80
    netloc = ip if t.port == default else f"{ip}:{t.port}"
    path = p.path or "/"
    if p.query:
        path += "?" + p.query
    host_header = t.host if t.port == default else f"{t.host}:{t.port}"
    return f"{t.scheme}://{netloc}{path}", {"Host": host_header}, {"sni_hostname": t.host}


def fetch_article(url: str, policy: FetchPolicy) -> dict:
    """Fetch one page. Raises GuardError (policy), TransientError (retryable) or ArticleError (permanent)."""
    deadline = time.monotonic() + policy.total_timeout_seconds
    current = url
    timeout = httpx.Timeout(policy.timeout_seconds, connect=policy.timeout_seconds)
    with httpx.Client(timeout=timeout, follow_redirects=False, verify=True) as client:
        for hop in range(policy.max_redirects + 1):
            target = check_url(current, policy)  # validates scheme/host/IP BEFORE any request
            pinned_url, headers, ext = _pinned(target)
            headers.update({"User-Agent": policy.user_agent, "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8", "Accept-Encoding": "gzip"})
            try:
                with client.stream("GET", pinned_url, headers=headers, extensions=ext) as resp:
                    if resp.is_redirect:
                        loc = resp.headers.get("location")
                        if not loc:
                            raise ArticleError("redirect without Location header")
                        current = urljoin(current, loc)
                        continue
                    if resp.status_code in (404, 410, 401, 403, 451):
                        raise ArticleError(f"HTTP {resp.status_code}")
                    resp.read() if resp.status_code >= 400 else None
                    raise_for_service("fetch", resp)
                    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype and ctype not in _OK_TYPES:
                        raise GuardError(f"content type '{ctype}' is not allowed")
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > policy.max_bytes:
                        raise GuardError(f"response too large ({declared} bytes > {policy.max_bytes})")
                    buf = bytearray()
                    for chunk in resp.iter_bytes():
                        buf += chunk
                        if len(buf) > policy.max_bytes:
                            raise GuardError(f"response exceeded the {policy.max_bytes}-byte limit")
                        if time.monotonic() > deadline:
                            raise TransientError("fetch exceeded the total time limit")
                    enc = resp.charset_encoding or "utf-8"
                    try:
                        raw = bytes(buf).decode(enc, errors="replace")
                    except LookupError:
                        raw = bytes(buf).decode("utf-8", errors="replace")
                    title, text, meta = plain_to_text(raw) if ctype.startswith("text/plain") else html_to_text(raw)
                    return {
                        "url": url,
                        "final_url": current,
                        "canonical_url": canonical_url(current),
                        "status_code": resp.status_code,
                        "title": title or current,
                        "published": meta.get("article:published_time") or meta.get("date") or meta.get("og:updated_time"),
                        "description": (meta.get("og:description") or meta.get("description") or "")[:400],
                        "text": text,
                        "content_hash": content_hash(text),
                        "bytes": len(buf),
                        "fetched_at": datetime.now(timezone.utc).isoformat(),
                    }
            except TRANSPORT_ERRORS as e:
                raise TransientError(f"fetch: network problem ({type(e).__name__}: {e})") from e
            except httpx.TimeoutException as e:
                raise TransientError(f"fetch: timed out ({type(e).__name__})") from e
            except httpx.InvalidURL as e:
                raise GuardError(f"invalid URL ({e})") from e
            except httpx.HTTPError as e:
                raise TransientError(f"fetch: HTTP error ({type(e).__name__}: {e})") from e
    raise GuardError(f"too many redirects (> {policy.max_redirects})")
