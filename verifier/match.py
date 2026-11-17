"""The check that turns a model's "supported" into a fact: the quoted evidence must really be on the fetched page.

Both strings are normalised the same way before comparing (the assignment's four steps, in this order):
  1. decode HTML entities  2. Unicode NFKC  3. collapse every run of whitespace into one space  4. lowercase
No other normalisation is applied (no punctuation stripping, no quote or dash folding). Two further rules are not
normalisation but guard against a trivially short quote matching almost any page:
  * the excerpt must be at most MAX_EXCERPT characters (as returned, before normalising);
  * after normalising it must be at least MIN_EXCERPT characters.
"""
import html
import re
import unicodedata

MAX_EXCERPT = 300
MIN_EXCERPT = 25
_WS = re.compile(r"\s+")


def normalise(s: str) -> str:
    s = html.unescape(s)
    s = unicodedata.normalize("NFKC", s)
    s = _WS.sub(" ", s).strip()
    return s.lower()


def evidence_ok(excerpt: object, page_text: str) -> bool:
    if not isinstance(excerpt, str) or len(excerpt) > MAX_EXCERPT:
        return False
    e = normalise(excerpt)
    if len(e) < MIN_EXCERPT:
        return False
    return e in normalise(page_text)
