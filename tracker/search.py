"""search_web via the Tavily REST API."""
import httpx

from .config import Config, need_env
from .errors import TransientError
from .http_errors import TRANSPORT_ERRORS, raise_for_service, transport_error

TAVILY_URL = "https://api.tavily.com/search"


def search_web(query: str, cfg: Config, topic: str = "general", *, client: httpx.Client | None = None) -> dict:
    """Return {"results": [{title, url, snippet, published}], "credits": n}. Raises classified errors."""
    key = need_env("TAVILY_API_KEY")
    body = {
        "query": query[:400],
        "max_results": cfg.search_max_results,
        "search_depth": "basic",
        "include_answer": False,
        "include_raw_content": False,
        "include_usage": True,
    }
    if topic == "news":
        body["topic"] = "news"
    if cfg.search_time_range:
        body["time_range"] = cfg.search_time_range
    own = client or httpx.Client(timeout=20)
    try:
        resp = own.post(TAVILY_URL, json=body, headers={"Authorization": f"Bearer {key}"})
    except TRANSPORT_ERRORS as e:
        raise transport_error("tavily", e) from e
    except httpx.TimeoutException as e:
        raise TransientError(f"tavily: timed out ({type(e).__name__})") from e
    finally:
        if client is None:
            own.close()
    raise_for_service("tavily", resp)
    data = resp.json()
    results = []
    for r in data.get("results", []):
        url = str(r.get("url", ""))
        if not url.lower().startswith(("http://", "https://")):
            continue
        results.append(
            {
                "title": str(r.get("title", ""))[:200],
                "url": url,
                "snippet": str(r.get("content", ""))[:400],
                "published": r.get("published_date"),
            }
        )
    credits = (data.get("usage") or {}).get("credits", 1)
    return {"results": results, "credits": credits}
