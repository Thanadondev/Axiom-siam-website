"""
The factory's DTP 28-colour CMYK chart (DTP-28color-cs4.svg, exported from
Illustrator) as the website's colour data:

  apps/web/public/designer/palette.js   the swatches every colour picker offers
  apps/api/src/bibs/dtp-chart.json      hex -> the CMYK the print files use

Each swatch on the chart is a square in its screen colour with its number
(0001-0280) and its CMYK printed under it; the CMYK under the swatch is what
the factory prints, so it is taken from there, never converted from the hex.

Usage (from platform/):  python scripts/dtp-chart.py ../DTP-28color-cs4.svg
"""
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # platform/
svg = io.open(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "DTP-28color-cs4.svg", encoding="utf-8").read()

# class -> fill, from the stylesheet ("  .cls-40, .cls-41 { fill: #231f20; }")
style = svg[svg.index("<style>") + len("<style>"):svg.index("</style>")]
fills = {}
for m in re.finditer(r"([^{}]+)\{\s*fill:\s*(#[0-9a-fA-F]{6})\s*;?\s*\}", style):
    for c in m.group(1).split(","):
        fills[c.strip().lstrip(".")] = m.group(2).lower()

# the swatches: 28.3 pt squares (their frames are taller)
squares = [(m.group(1), float(m.group(2)), float(m.group(3)))
           for m in re.finditer(r'<rect class="([^"]+)" x="([\d.]+)" y="([\d.]+)" width="28\.3" height="28\.3"', svg)]
# the labels under them: the number, and the CMYK
labels = [(float(m.group(1)), float(m.group(2)), re.sub(r"<[^>]+>", "", m.group(3)).strip())
          for m in re.finditer(r'<text[^>]*transform="translate\(([\d.]+) ([\d.]+)\)"[^>]*>(.*?)</text>', svg, re.S)]

swatches = []
for cls, x, y in squares:
    under = [t for (tx, ty, t) in labels if x - 2 <= tx <= x + 28.3 and y + 28.3 <= ty <= y + 34]
    cmyk = next(t for t in under if t.startswith("C"))
    code = next(t for t in under if re.fullmatch(r"\d{4}", t))
    swatches.append({"n": code, "c": fills[cls], "k": " ".join(cmyk.split())})
swatches.sort(key=lambda s: s["n"])

assert len(swatches) == 280, len(swatches)
assert len({s["c"] for s in swatches}) == 280, "two swatches share a screen colour"
assert all(re.fullmatch(r"C[\d.]+ M[\d.]+ Y[\d.]+ K[\d.]+", s["k"]) for s in swatches)

web = HERE / "apps/web/public/designer/palette.js"
web.write_text(
    "/* DTP 28-color CMYK chart palette extracted from DTP-28color-cs4.svg (scripts/dtp-chart.py):\n"
    "   n = the swatch's number on the chart, c = its screen colour, k = the CMYK the factory prints */\n"
    "window.AXIOM_PALETTE=" + json.dumps(swatches, ensure_ascii=False) + ";\n",
    encoding="utf-8", newline="\n")

api = HERE / "apps/api/src/bibs/dtp-chart.json"
api.write_text(json.dumps({
    "source": "DTP-28color-cs4.svg (the factory's DTP 28-colour CMYK chart), via scripts/dtp-chart.py",
    "colors": {s["c"]: s["k"] for s in swatches},
    "numbers": {s["c"]: s["n"] for s in swatches},
}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8", newline="\n")
print(f"{len(swatches)} swatches -> {web.relative_to(HERE)}, {api.relative_to(HERE)}")
