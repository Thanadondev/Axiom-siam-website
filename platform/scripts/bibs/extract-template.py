"""CB-005 templates -> apps/api/src/bibs/cb-005.json: each piece's cut line and rib bands
as SVG paths in mm, relative to the cut line's top-left corner (y down), and where the
piece sits on its size's page (x, y), so a job is laid out as the template is.

usage (PyMuPDF; -P, not -I, so the user site-packages load):
  python -P scripts/bibs/extract-template.py <folder of CB-005_<size>.ai> apps/api/src/bibs/cb-005.json
The folder holds the per-size files split from
\\\\SynologyNAS\\Axiom Siam\\Artwork\\PT_grn reversible bibs (CB-005).ai"""
import fitz, sys, glob, os, json, re
MM = 25.4/72
SIZE = {"S": "S", "M": "M", "L": "L", "XL-2L": "XL", "XXL-3L": "XXL", "Special_M_size": "SPM", "Special_L_size": "SPL"}
def f(v): return f"{v:.2f}".rstrip("0").rstrip(".")
def path_d(items, ox, oy):
    out, cur = [], None
    for it in items:
        k = it[0]
        if k == "re":
            r = it[1]; x, y, w, h = (r.x0*MM-ox, r.y0*MM-oy, r.width*MM, r.height*MM)
            out.append(f"M{f(x)} {f(y)}h{f(w)}v{f(h)}h{f(-w)}Z"); cur = None; continue
        pts = [(p.x*MM-ox, p.y*MM-oy) for p in it[1:]]
        if cur is None or abs(cur[0]-pts[0][0]) > 0.01 or abs(cur[1]-pts[0][1]) > 0.01:
            out.append(f"M{f(pts[0][0])} {f(pts[0][1])}")
        if k == "l": out.append(f"L{f(pts[1][0])} {f(pts[1][1])}")
        elif k == "c": out.append("C" + " ".join(f"{f(x)} {f(y)}" for x, y in pts[1:]))
        cur = pts[-1]
    return "".join(out) + "Z"
def neck_depth(d, items):
    # deepest point of the cut line near the centre, from the top
    r = d["rect"]; cx = (r.x0+r.x1)/2; w = r.width
    ys = [p.y for it in items if it[0] in "lc" for p in it[1:] if abs(p.x-cx) < w*0.12 and p.y < r.y0 + r.height*0.5]
    return (max(ys)-r.y0)*MM if ys else 0
out = {"code": "CB-005", "name": "Reversible bibs", "source": r"\\SynologyNAS\Axiom Siam\Artwork\PT_grn reversible bibs (CB-005).ai", "sizes": {}}
for fn in sorted(glob.glob(sys.argv[1] + "/*.ai")):
    key = re.sub(r"^CB-005_|\.ai$", "", os.path.basename(fn))
    size = SIZE[key]
    p = fitz.open(fn)[0]
    dr = p.get_drawings()
    outlines = [d for d in dr if d["type"] == "s"]
    fills = [d for d in dr if d["type"] == "f"]
    rows = sorted({round(d["rect"].y0*MM/100) for d in outlines})
    pieces = []
    for o in outlines:
        r = o["rect"]; ox, oy = r.x0*MM, r.y0*MM
        def overlap(x, o):
            a, b = x["rect"], o["rect"]
            if a.y1 < b.y0 - 30/MM or a.y0 > b.y1 + 5/MM: return 0
            return min(a.x1, b.x1) - max(a.x0, b.x0)
        mine = [x for x in fills if max(outlines, key=lambda o2: overlap(x, o2)) is o and overlap(x, o) > 0]
        ribs = []
        for x in mine:
            xr = x["rect"]; cx = ((xr.x0+xr.x1)/2 - r.x0) / r.width
            zone = "hem" if xr.y0 > r.y0 + r.height*0.8 else "neck" if 0.3 < cx < 0.7 else "arm"
            ribs.append({"zone": zone, "d": path_d(x["items"], ox, oy)})
        pieces.append({"r": r, "row": round(r.y0*MM/100), "nd": neck_depth(o, o["items"]),
                       "w": round(r.width*MM, 1), "h": round(r.height*MM, 1), "cut": path_d(o["items"], ox, oy), "ribs": ribs})
    # front = the deep U neck; side A = the row that carries the rib bands (or the only row)
    by_row = {}
    for pc in pieces: by_row.setdefault(pc["row"], []).append(pc)
    res = {"page": {"w": round(p.rect.width*MM, 1), "h": round(p.rect.height*MM, 1)}}
    for row, pcs in sorted(by_row.items()):
        side = "A" if any(pc["ribs"] for pc in pcs) or len(by_row) == 1 else "B"
        pcs.sort(key=lambda pc: -pc["nd"])
        for part, pc in zip(["front", "back"], pcs):
            res.setdefault(side, {})[part] = {k: pc[k] for k in ("w", "h", "cut", "ribs")} | {
                "neckDepth": round(pc["nd"], 1), "x": round(pc["r"].x0*MM, 1), "y": round(pc["r"].y0*MM, 1)}
    out["sizes"][size] = res
    print(size, res["page"], {s: {p: (v["x"], v["y"], v["w"], v["h"], len(v["ribs"])) for p, v in sd.items()} for s, sd in res.items() if s != "page"})
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("bytes", os.path.getsize(sys.argv[2]))
