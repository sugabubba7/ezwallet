"""HTML -> plain text using only the standard library. Scripts, styles and markup are discarded;
what remains is inert text that is only ever shown to the model inside an untrusted-data envelope."""
import re
from html.parser import HTMLParser

_SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "canvas", "head", "nav", "footer", "aside", "form", "button"}
_BLOCK = {"p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "section", "article", "main", "blockquote", "pre"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self.meta: dict[str, str] = {}
        self._skip = 0
        self._in_title = False
        self._in_head = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "head":
            self._in_head = True
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content"):
                self.meta.setdefault(key, a["content"])
        if tag in _SKIP and tag != "head":
            self._skip += 1
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "head":
            self._in_head = False
        if tag == "title":
            self._in_title = False
        if tag in _SKIP and tag != "head" and self._skip:
            self._skip -= 1
        if tag in _BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip and not self._in_head:
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str, dict[str, str]]:
    """Return (title, text, meta). Never raises on bad markup."""
    p = _Text()
    try:
        p.feed(html)
        p.close()
    except Exception:  # noqa: BLE001 - html.parser can choke on pathological input
        pass
    title = p.meta.get("og:title") or p.title
    text = "".join(p.parts)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    text = "\n".join(line.strip() for line in text.splitlines()).strip()
    return re.sub(r"\s+", " ", title).strip()[:300], text, p.meta


def plain_to_text(raw: str) -> tuple[str, str, dict[str, str]]:
    text = re.sub(r"[ \t]+", " ", raw)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return "", text, {}


def excerpt(text: str, max_chars: int, keywords: tuple[str, ...] = ()) -> str:
    """What the model sees of an article: the lede plus the substantive lines that mention the topic's keywords,
    in their original order, within max_chars. Short lines (menus, buttons, bylines) are dropped first."""
    lines = [ln for ln in text.splitlines() if len(ln) >= 60]
    if not lines:
        return text[:max_chars]
    if sum(len(ln) + 1 for ln in lines) <= max_chars:
        return "\n".join(lines)
    score = lambda ln: sum(ln.lower().count(k) for k in keywords)  # noqa: E731
    order = [0] + sorted(range(1, len(lines)), key=lambda i: (-score(lines[i]), i))
    picked: set[int] = set()
    total = 0
    for i in order:
        piece = lines[i] if len(lines[i]) <= max_chars else lines[i][:max_chars]
        if total + len(piece) + 1 > max_chars:
            continue
        picked.add(i)
        lines[i] = piece
        total += len(piece) + 1
    return "\n".join(lines[i] for i in sorted(picked))
