"""Build researcher/stub_data.json from a committed tracker report (reports/run1.md): real developments, real URLs and quotes."""
import json
import re
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "reports/run1.md")
text = src.read_text()
section = text.split("## New since last run", 1)[1].split("\n## ", 1)[0]
devs = []
for block in re.split(r"\n(?=\d+\. \*\*)", section.strip()):
    m = re.match(r"\d+\. \*\*(.+?)\*\*\s*\n\s+(.+?)\n((?:\s+- .+\n?)+)", block.strip() + "\n", re.S)
    if not m:
        continue
    title, summary, srcs = m.group(1), " ".join(m.group(2).split()), m.group(3)
    sources = [{"title": t, "url": u, "quote": q}
               for t, u, q in re.findall(r'- \[(.+?)\]\((https?://\S+?)\) \([^)]*\) — "(.+)"\s*$', srcs, re.M)]
    if sources:
        devs.append({"title": title, "summary": summary, "sources": sources})
out = {"source": f"{src} (a real tracker run; pages fetched 2026-10-05)", "developments": devs}
Path("researcher/stub_data.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"{len(devs)} developments, {sum(len(d['sources']) for d in devs)} sources")
