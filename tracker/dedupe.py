"""URL canonicalisation and 'is this the same development?' scoring. Pure code, no model."""
import hashlib
import math
import re
from collections import Counter
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TRACKING = re.compile(r"^(utm_.*|fbclid|gclid|mc_.*|ref|ref_src|source|cmpid|igshid|_hsenc|_hsmi)$", re.I)
_STOP = set(
    "a an and are as at be by for from has have in is it its of on or that the their this to was were will with "
    "new now more after over about into than also says said announced announces launches launch launched".split()
)


def canonical_url(url: str) -> str:
    p = urlsplit(url.strip())
    host = (p.hostname or "").lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    port = p.port
    netloc = host if port in (None, 80, 443) else f"{host}:{port}"
    path = re.sub(r"/index\.(html?|php)$", "/", p.path or "/")
    if len(path) > 1:
        path = path.rstrip("/")
    query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not _TRACKING.match(k)))
    return urlunsplit(((p.scheme or "https").lower(), netloc, path, query, ""))


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w$%.,]+", " ", s.lower())).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode()).hexdigest()


def _terms(text: str) -> Counter:
    toks = [t for t in re.findall(r"[a-z0-9][a-z0-9.+-]*", text.lower()) if t not in _STOP and len(t) > 1]
    return Counter(toks)


def similarity(a: str, b: str) -> float:
    """Cosine similarity of term-frequency vectors (stop words removed)."""
    ta, tb = _terms(a), _terms(b)
    if not ta or not tb:
        return 0.0
    dot = sum(ta[t] * tb[t] for t in ta.keys() & tb.keys())
    return dot / (math.sqrt(sum(v * v for v in ta.values())) * math.sqrt(sum(v * v for v in tb.values())))
