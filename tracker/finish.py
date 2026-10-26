"""Validate the model's finish(report). Provenance and dedupe decisions are made here, in code."""
import json
import re
from dataclasses import dataclass, field

from .dedupe import canonical_url, normalize_text, similarity


@dataclass
class Source:
    url: str
    canonical: str
    title: str
    quote: str


@dataclass
class Dev:
    title: str
    summary: str
    rank: int
    existing_id: int | None
    sources: list[Source]
    decisions: list[str] = field(default_factory=list)


@dataclass
class Known:
    id: int
    title: str
    summary: str
    sources: list[dict]  # {url, title, quote}


_NUM = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?")


def _numbers(summary: str) -> list[str]:
    out = []
    for m in _NUM.findall(summary):
        n = m.rstrip(".,")
        digits = re.sub(r"\D", "", n)
        if (len(digits) >= 3 and not digits.startswith("0")) or n.startswith("$") or n.endswith("%") or "." in n:
            out.append(n.lower())
    return out


_FENCE = re.compile(r"^\s*```[a-zA-Z]*\s*|\s*```\s*$")
_ALT_KEYS = ("items", "results", "top_k", "top_developments", "ranked")


def coerce_report(report) -> tuple[object, str | None]:
    """Undo the common ways models mangle the `report` argument, so a formatting slip is not mistaken for a bad report.

    Handles: the report sent as JSON *text* (often in ```json fences, with raw line breaks inside strings, or with
    chatter before/after), a bare list of developments, the report nested one level too deep, and an alternate key
    for the list. Returns (report, error); `error` explains a JSON failure precisely so the model can fix it.
    Content is never invented or repaired here: provenance is still checked strictly by `validate`.
    """
    if isinstance(report, str):
        text = _FENCE.sub("", report.strip())
        starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
        if not starts:
            return None, ("`report` was sent as text with no JSON in it. Send `report` as a JSON object "
                          '(not a string): {"developments": [{"rank": 1, "title": ..., "summary": ..., "sources": [...]}]}')
        try:
            # strict=False accepts raw line breaks inside strings; raw_decode ignores trailing chatter
            report, _ = json.JSONDecoder(strict=False).raw_decode(text[min(starts):])
        except json.JSONDecodeError as e:
            return None, (f"`report` was sent as text that is not valid JSON ({e.msg} at character {e.pos}). "
                          "Send `report` as a JSON object, not a string. If it was cut off, use shorter summaries and quotes.")
    if isinstance(report, list):
        report = {"developments": report}
    if isinstance(report, dict) and "developments" not in report:
        if isinstance(report.get("report"), (dict, list)):
            return coerce_report(report["report"])
        alt = next((k for k in _ALT_KEYS if isinstance(report.get(k), list)), None)
        if alt:
            report = {**report, "developments": report[alt]}
    return report, None


def validate(report, *, k: int, known: dict[int, Known], fetched: dict[str, dict], auto_merge: float,
             min_trust: float) -> tuple[list[Dev], list[str]]:
    """Return (developments, errors). Errors are plain strings fed back to the model."""
    errors: list[str] = []
    report, err = coerce_report(report)
    if err:
        return [], [err]
    if not isinstance(report, dict) or not isinstance(report.get("developments"), list) or not report["developments"]:
        return [], ["report must be an object with a non-empty `developments` list"]
    raw = report["developments"]
    if len(raw) > k:
        errors.append(f"too many developments: {len(raw)} > K={k}")
    used_existing: dict[int, Dev] = {}
    devs: list[Dev] = []
    norm_cache: dict[str, str] = {}

    def norm_text_of(canon: str) -> str:
        if canon not in norm_cache:
            norm_cache[canon] = normalize_text(fetched[canon]["text"])
        return norm_cache[canon]

    for i, d in enumerate(raw[:k + 3], start=1):
        tag = f"developments[{i - 1}]"
        if not isinstance(d, dict):
            errors.append(f"{tag}: must be an object")
            continue
        title, summary = str(d.get("title", "")).strip(), str(d.get("summary", "")).strip()
        if not title or len(title) > 200:
            errors.append(f"{tag}: title is required (<= 200 chars)")
        if not summary or len(summary) > 700:
            errors.append(f"{tag}: summary is required (<= 700 chars)")
        try:
            rank = int(d.get("rank", i))
        except (TypeError, ValueError):
            rank = i
        eid = d.get("existing_id")
        try:
            eid = int(eid) if eid not in (None, "", 0) else None
        except (TypeError, ValueError):
            eid = None
        if eid is not None and eid not in known:
            errors.append(f"{tag}: existing_id {eid} is not a known development")
            eid = None
        srcs_raw = d.get("sources")
        if not isinstance(srcs_raw, list) or not srcs_raw:
            errors.append(f"{tag}: at least one source is required")
            continue
        sources: list[Source] = []
        evidence: list[str] = []
        for j, s in enumerate(srcs_raw[:12]):
            stag = f"{tag}.sources[{j}]"
            if not isinstance(s, dict) or not isinstance(s.get("url"), str):
                errors.append(f"{stag}: needs a url")
                continue
            url, quote = s["url"].strip(), str(s.get("quote", "")).strip()
            try:
                canon = canonical_url(url)
            except ValueError:
                errors.append(f"{stag}: malformed url")
                continue
            if canon in fetched:
                if len(quote) < 30 or normalize_text(quote) == normalize_text(fetched[canon]["title"]):
                    errors.append(f"{stag}: quote must be a verbatim passage of >= 30 chars from the article body that states the event "
                                  "(who did what, and when/how much), not the headline")
                    continue
                if normalize_text(quote) not in norm_text_of(canon):
                    errors.append(f"{stag}: the quote does not appear in the fetched text of {url}; copy it verbatim")
                    continue
                sources.append(Source(fetched[canon]["final_url"], canon, fetched[canon]["title"][:300], quote[:2000]))
                evidence.append(norm_text_of(canon))
                continue
            prior = None
            if eid is not None:
                prior = next((x for x in known[eid].sources if canonical_url(x["url"]) == canon), None)
            if prior is None:
                errors.append(f"{stag}: {url} was not fetched this run, so it cannot be cited")
                continue
            sources.append(Source(prior["url"], canon, prior.get("title", ""), prior.get("quote", "")))
            evidence.append(normalize_text(prior.get("quote", "")))
        if not sources:
            continue
        unchanged = eid is not None and summary == known[eid].summary
        if not unchanged:
            ev = " ".join(evidence)
            missing = [n for n in _numbers(summary) if n not in ev]
            if missing:
                errors.append(f"{tag}: the summary states {', '.join(missing)}, which does not appear in its cited sources; remove or correct it")
        devs.append(Dev(title[:200], summary[:700], rank, eid, sources))

    if errors:
        return [], errors

    # -- same-development decisions, made by code, not by the model -------------
    for dev in devs:
        text = f"{dev.title} {dev.summary}"
        shared = next((kid for kid, kn in known.items()
                       if any(canonical_url(x["url"]) in {s.canonical for s in dev.sources} for x in kn.sources)), None)
        if dev.existing_id is None:
            if shared is not None and shared not in used_existing:
                dev.existing_id = shared
                dev.decisions.append(f"merged into #{shared}: a cited URL already supports it")
            else:
                best = max(known.values(), key=lambda kn: similarity(text, f"{kn.title} {kn.summary}"), default=None)
                if best is not None:
                    sim = similarity(text, f"{best.title} {best.summary}")
                    if sim >= auto_merge and best.id not in used_existing:
                        dev.existing_id = best.id
                        dev.decisions.append(f"merged into #{best.id}: text similarity {sim:.2f} >= {auto_merge}")
        else:
            kn = known[dev.existing_id]
            sim = similarity(text, f"{kn.title} {kn.summary}")
            if sim < min_trust and shared != dev.existing_id:
                dev.decisions.append(f"model claimed #{dev.existing_id} but similarity is only {sim:.2f}; treated as new")
                dev.existing_id = None
        if dev.existing_id is not None:
            if dev.existing_id in used_existing:  # two entries resolve to one development: fold into the first
                first = used_existing[dev.existing_id]
                have = {s.canonical for s in first.sources}
                first.sources += [s for s in dev.sources if s.canonical not in have]
                first.decisions.append(f"folded a duplicate entry '{dev.title}' into it")
                dev.rank = 10**6
                continue
            used_existing[dev.existing_id] = dev
    devs = sorted((d for d in devs if d.rank < 10**6), key=lambda d: d.rank)
    for n, d in enumerate(devs, start=1):
        d.rank = n
    return devs, []


def validate_salvage(report, **kw) -> tuple[list[Dev], list[str]]:
    """Second-chance validation: keep every development that is fully supported and drop the ones that are not,
    instead of rejecting the whole report. Returns (developments, reasons the dropped ones failed)."""
    report, err = coerce_report(report)
    if err:
        return [], [err]
    if not isinstance(report, dict) or not isinstance(report.get("developments"), list) or not report["developments"]:
        return [], ["report must be an object with a non-empty `developments` list"]
    kept, dropped = [], []
    for i, d in enumerate(report["developments"][: kw["k"]]):
        _, errs = validate({"developments": [d]}, **kw)
        if errs:
            dropped += [f"developments[{i}] dropped: {e.split(': ', 1)[-1]}" for e in errs[:1]]
        else:
            kept.append(d)
    if not kept:
        return [], dropped or ["no development was fully supported by its sources"]
    devs, errs = validate({"developments": kept}, **kw)
    return devs, dropped + errs
