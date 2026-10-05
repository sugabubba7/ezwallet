"""Render the markdown report: New since last run, Still in top K, Dropped."""
from datetime import datetime, timezone
from urllib.parse import urlsplit


def _src(s: dict) -> str:
    host = urlsplit(s["url"]).hostname or s["url"]
    q = (s.get("quote") or "").strip().replace("\n", " ")
    line = f"[{s.get('title') or host}]({s['url']}) ({host})"
    return f"  - {line}" + (f' — "{q[:300]}"' if q else "")


def render(*, topic: str, k: int, status: str, partial_reason: str | None, run_id: int | None,
           developments: list[dict], dropped: list[dict], stats: dict, articles: list[dict],
           first_run: bool, saved: bool = True, evidence: list[dict] | None = None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = [f"# Competitor tracker report", "", f"- **Topic:** {topic}", f"- **Run:** {run_id if run_id else '(not saved)'} · {now}",
           f"- **Status:** {'COMPLETE' if status == 'complete' else status.upper()}" + (f" — {partial_reason}" if partial_reason else ""),
           f"- **K:** {k} · **steps:** {stats.get('steps', 0)} · **fetches:** {stats.get('fetches', 0)} · "
           f"**tokens:** {stats.get('prompt_tokens', 0) + stats.get('output_tokens', 0)} · **est. cost:** ${stats.get('cost_usd', 0):.4f}"]
    if not saved:
        out.append("- **WARNING:** the backend could not be reached, so this run was NOT saved to the tracker's memory.")
    if status == "failed":
        out += ["", "> **FAILED RUN.** It stopped before gathering anything it could report (see Status). Nothing was ranked, and the previous top K is unchanged."]
    elif status != "complete":
        out += ["", "> **PARTIAL REPORT.** The run stopped before it finished (see Status). Items below use only the evidence gathered so far."]
    if first_run:
        out += ["", "_First run: nothing has been reported before, so everything is new._"]

    def block(title: str, items: list[dict], empty: str) -> None:
        out.extend(["", f"## {title}", ""])
        if not items:
            out.append(f"_{empty}_")
        for d in items:
            out.append(f"{d['rank']}. **{d['title']}**  \n   {d['summary']}")
            out.extend(_src(s) for s in d["sources"])
            out.append("")

    new = [d for d in developments if d["section"] == "new"]
    still = [d for d in developments if d["section"] == "still"]
    block("New since last run", new, "Nothing new made the top K.")
    block("Still in top K", still, "Nothing carried over from the last run.")
    out += ["", "## Dropped", ""]
    out += [f"- **{d['title']}** — fell out of the top {k}." for d in dropped] or ["_Nothing dropped._"]
    if evidence:
        out += ["", "## Evidence gathered (unranked)", ""]
        out += [f"- [{e['title']}]({e['url']}): {e['lead']}" for e in evidence]
    c = {s: sum(1 for a in articles if a["status"] == s) for s in ("fetched", "skipped", "rejected", "failed")}
    out += ["", "## Articles this run", "",
            f"fetched {c['fetched']} · skipped as already seen {c['skipped']} · rejected by guardrail {c['rejected']} · failed {c['failed']}", ""]
    for a in articles:
        out.append(f"- `{a['status']}` {a['url']}" + (f" — {a['reason']}" if a.get("reason") else ""))
    return "\n".join(out).rstrip() + "\n"
