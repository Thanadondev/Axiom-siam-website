"""
Axiom kit models, v3 — cut and sewn like a real jersey.

Each kit is drafted as separate pattern pieces in centimetre-true sizes
(size L): a front, a back and two set-in sleeves (or cut-in armholes for a
singlet). The pieces are laid flat around the display form and sewn in a
cloth simulation: sewing springs pull the seams shut (shoulders, sides,
sleeve caps into the armholes, the sleeve underarm), then the garment settles
on the form under gravity. Seams are then welded into one manifold shell.

Details after the drape:
  * trim bands (neck, cuff/armhole, hem) cut in pattern space with mitred
    corners, so a V-neck band ends in a sharp V;
  * every opening gets a turned, rolled edge built on the cut edge itself;
  * a shallow stitch groove along each band's inner edge;
  * subdivision for a soft, continuous surface; real fabric thickness with a
    darker lining inside.

The web paints colours, patterns and the name/number in flat-pattern space:
each vertex keeps its pattern position (kit units, front z>0 / back z<0) as
the point attributes _rest/_restn. Kit units are the v1 units (1 = 26 cm, the
high shoulder point at y = 1.45) so the web's pattern formulas keep working.

Run (bpy 4.2 + triangle + shapely):
  py -3.11 build_kits_v3.py --only=striker ../../apps/web/public/models/kits
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
import triangle
from mathutils import Vector, Matrix
from shapely.geometry import Polygon, LineString, Point as SPoint
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import factory_kit as fk  # noqa: E402  (the display form)

ARGS = [a for a in sys.argv[1:] if not a.endswith(".py")]
ONLY = [a.split("=", 1)[1] for a in ARGS if a.startswith("--only=")]
POS = [a for a in ARGS if not a.startswith("--")]
OUT = Path(POS[-1] if POS else HERE / "kits_v3").resolve()
OUT.mkdir(parents=True, exist_ok=True)

S = 0.26            # metres per kit unit
J = 1.25            # form reference height (metres) — see factory_kit.dress_form
Z_HPS = J + 0.335   # where the high shoulder point sits on the form
TOP = 1.45          # kit-unit height of the high shoulder point
TRI_AREA = 0.00011  # m², ≈ 1.6 cm edges for the simulation mesh

# ---------------------------------------------------------------- kits (size L, metres)
# tuning knobs: --opt=key:value,key:value
OPT = dict(kv.split(":") for a in ARGS if a.startswith("--opt=") for kv in a.split("=", 1)[1].split(","))
KITS = {
    #            sleeves   neck    chest  length  neck drop (front)
    "striker": dict(sleeves="short", neck="v", cw=0.27, L=0.74, nd=0.165),
    "smash": dict(sleeves="short", neck="crew", cw=0.26, L=0.72, nd=0.095),
    "pacer": dict(sleeves="none", neck="crew", cw=0.25, L=0.72, nd=0.10),
    # the basketball singlet is cut on the factory's bib pattern (CB-005): a deep round (U) neck,
    # as deep as the pattern's (front neck 0.20-0.23 of the length on M-XL)
    "bib": dict(sleeves="none", neck="crew", cw=0.29, L=0.78, nd=0.17),
    "club": dict(sleeves="short", neck="polo", cw=0.27, L=0.74, nd=0.085),
    # a pullover hoodie: long set-in sleeves, rib cuffs and hem, a lined hood and a kangaroo pocket
    "warmup": dict(sleeves="long", neck="hood", cw=0.29, L=0.70, nd=0.085),
    # the warm-up top (piste): raglan long sleeves running up to the neck, rib cuffs and hem;
    # crew neck, or zipped all the way with a stand collar
    "tempo": dict(sleeves="long", neck="crew", raglan=True, cw=0.29, L=0.70, nd=0.085),
    "tempozip": dict(sleeves="long", neck="zip", raglan=True, cw=0.29, L=0.70, nd=0.065),
    # training shorts: one piece per leg (no side seam), elastic waistband, hemmed legs
    # (cut with room at the hip and a wide leg: training shorts hang loose, they don't hug the seat)
    "stride": dict(sleeves="none", neck="waist", garment="shorts", cw=0.272, L=0.485, nd=0.0),
    # track pants (the warm-up suit's bottoms): the shorts' cut carried on down to the ankle,
    # a slim leg tapering to a plain hemmed ankle (like a Grand Sport / Warrix training pant)
    "track": dict(sleeves="none", neck="waist", garment="pants", cw=0.272, L=float(OPT.get("L", 0.98)), nd=0.0,
                  vc=float(OPT.get("vc", 0.715)), lf=float(OPT.get("lf", 0.135)), lb=float(OPT.get("lb", 0.155)),
                  rise=0.0, cuff=float(OPT.get("cuff", 0.025)), ef=float(OPT.get("ef", 0.04)), eb=float(OPT.get("eb", 0.07)),
                  # the leg narrows through the thigh to the knee, then runs on gently to the ankle
                  knee=(float(OPT.get("kv", 0.42)), float(OPT.get("kf", 0.19)), float(OPT.get("kb", 0.22)))),
}
Z_WAIST = fk.HIP_WAIST
# which lower-body form the bottoms are draped on: the hip form (shorts) or legs to the ankle (pants)
LOWER = dict(kind="hip")
LOWER_NAMES = ("hip_form", "pants_form", "hip_stand")


def lower_form(col):
    return fk.pants_form(col) if LOWER["kind"] == "pants" else fk.hip_form(col)
TRACE = "--trace" in ARGS


# ---------------------------------------------------------------- curves
def bez(p0, p1, p2, p3, n):
    p0, p1, p2, p3 = map(lambda a: np.array(a, float), (p0, p1, p2, p3))
    t = np.linspace(0, 1, 400)[:, None]
    P = ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + (t ** 3) * p3
    return even(P, n)


def even(P, n):
    """n points evenly spaced by arc length along polyline P (ends kept)"""
    P = np.asarray(P, float)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, P[:, 0]), np.interp(t, s, P[:, 1])], 1)


def seg(a, b, n):
    return even(np.array([a, b], float), n)


def length(P):
    return float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())


def count(L, step=0.016):
    n = max(3, int(round(L / step)) + 1)
    return n if n % 2 else n + 1


# ---------------------------------------------------------------- pattern pieces
class Piece:
    """a closed outline made of named edges (each an ordered point list); CCW"""

    def __init__(self, name, mat_base):
        self.name = name
        self.base = mat_base
        self.edges = []  # (tag, points)

    def add(self, tag, pts):
        self.edges.append((tag, np.asarray(pts, float)))

    def outline(self):
        pts, owner = [], []
        for k, (tag, P) in enumerate(self.edges):
            for j, p in enumerate(P[:-1]):  # each edge owns its start point, the next edge its end
                pts.append(p)
                owner.append((k, j))
        return np.array(pts), owner


RAGLAN_N = (0.07, -0.03)   # where a raglan seam meets the neckline (half-width, height below the HPS)


def raglan_body_piece(spec, face):
    """
    A front or back panel for raglan sleeves: no shoulder seam, the sleeve seam runs
    from the underarm straight up to the neckline. Edge names follow body_piece (the
    raglan seams are armR/armL), so the sleeves are sewn the same way.
    """
    cw, L = spec["cw"], spec["L"]
    nx, ny = RAGLAN_N
    # (the back dips a little below the raglan points, so the band curves round the nape)
    nd = spec["nd"] if face == "front" else -RAGLAN_N[1] + 0.014
    ax, ay = cw, -0.235
    hem_y = -L
    drop = 0.015 if face == "front" else 0.0
    p = Piece(face, "Body")
    p.add("hem", bez((-cw, hem_y + 0.02), (-cw * 0.45, hem_y - 0.005 - drop * 1.33), (cw * 0.45, hem_y - 0.005 - drop * 1.33), (cw, hem_y + 0.02), count(2 * cw, 0.01)))
    side = seg((cw, hem_y + 0.02), (ax, ay), count(abs(ay + L)))
    p.add("sideR", side)
    rag = bez((ax, ay), (ax - 0.055, ay + 0.05), (nx + 0.07, ny - 0.085), (nx, ny), 200)
    p.add("armR", even(rag, RAGLAN_COUNT))
    # neck: right raglan point → centre → left (the sleeves' tops make up the rest of it)
    a = np.linspace(0, math.pi, 200)
    neck = even(np.stack([nx * np.cos(a), ny - max(nd + ny, 0.0) * np.sin(a)], 1), count(math.pi * (nx + max(nd + ny, 0.01)) / 2, 0.007))
    p.add("neck", neck)
    p.add("armL", even(rag, RAGLAN_COUNT)[::-1] * [-1, 1])
    p.add("sideL", side[::-1] * [-1, 1])
    p.meta = dict(cw=cw, L=L, nw=nx, nd=nd, sx=nx, sy=ny, ax=ax, ay=ay, hem=hem_y, sleeved=True)
    return p


RAGLAN_COUNT = 31   # points on each raglan seam (front, back and the sleeve's two edges must agree)


def raglan_sleeve_piece(lenF, lenB, long=True):
    """
    A one-piece raglan sleeve: its top edge is part of the neckline, its two long
    edges are sewn to the front and back raglan seams, then down the underarm to the cuff.
    """
    sw = 0.2          # half the width at the underarm
    t = 0.05          # half the top (neck) edge
    sl = 0.47 if long else 0.115
    cf = 0.105 if long else 0.178
    ch = 0.24
    for _ in range(40):
        # fit the cap height so the longer raglan edge matches (+1 cm ease)
        capL = length(bez((-sw, 0), (-sw * 0.62, 0.02), (-t - 0.03, ch - 0.09), (-t, ch), 200))
        target = max(lenF, lenB) + 0.01
        ch *= 1 + 0.7 * (target - capL) / max(target, 1e-6)
    p = Piece("sleeve", "Sleeve")
    p.add("cuff", seg((-cf * 0.82, -sl), (cf * 0.82, -sl), count(2 * cf, 0.01)))
    nu = count(math.hypot(sw - cf, sl))
    k = -sl + 0.075
    ck = cf + (sw - cf) * (0.075 / sl)
    under = even(np.concatenate([seg((cf * 0.82, -sl), (ck, k), 8)[:-1], seg((ck, k), (sw, 0), nu)]), nu + 6)
    p.add("underB", under)
    p.add("capB", even(bez((sw, 0), (sw * 0.62, 0.02), (t + 0.03, ch - 0.09), (t, ch), 200), RAGLAN_COUNT))
    p.add("sneck", bez((t, ch), (t * 0.4, ch + 0.012), (-t * 0.4, ch + 0.012), (-t, ch), count(2 * t, 0.007)))
    p.add("capF", even(bez((-t, ch), (-t - 0.03, ch - 0.09), (-sw * 0.62, 0.02), (-sw, 0), 200), RAGLAN_COUNT))
    p.add("underF", under[::-1] * [-1, 1])
    p.meta = dict(sw=sw, ch=ch, sl=sl, cf=cf, raglan=True)
    return p


def body_piece(spec, face):
    """front or back body panel, pattern coordinates with the HPS at y = 0"""
    if spec.get("raglan"):
        return raglan_body_piece(spec, face)
    cw, L = spec["cw"], spec["L"]
    sleeved = spec["sleeves"] != "none"
    nw = {"polo": 0.088, "hood": 0.1}.get(spec["neck"], 0.092)
    nd = spec["nd"] if face == "front" else 0.025
    if sleeved:
        sx, sy = 0.235, -0.045           # shoulder point (set-in sleeve)
        ax, ay = cw, -0.235              # armpit
        arm_c = ((0.228, -0.12), (cw - 0.012, -0.215))
    else:
        sx, sy = nw + 0.075, -0.028      # narrow strap
        ax, ay = cw - 0.01, -0.27
        arm_c = ((sx + 0.005, -0.15), (cw - 0.09, ay + 0.005))
    # the front drapes over the chest, so it is cut a little longer to hang level with the back
    hem_y = -L
    drop = 0.015 if face == "front" else 0.0  # extra length at the centre front only
    nside = count(abs(ay + L))
    p = Piece(face, "Body")
    # hem: left corner → right corner, a gentle curve
    # (a rib hem cut narrower than the body made the body overhang it and fold at the side
    # seams; the hoodie's deep rib is cut straight instead)
    rib = False
    hw = cw
    p.add("hem", bez((-hw, hem_y + 0.02), (-hw * 0.45, hem_y - 0.005 - drop * 1.33), (hw * 0.45, hem_y - 0.005 - drop * 1.33), (hw, hem_y + 0.02), count(2 * hw, 0.01)))
    if rib:
        # straight up the rib, then easing out into the body
        r0, r1 = hem_y + 0.02 + 0.06, hem_y + 0.02 + 0.2
        side = np.concatenate([seg((hw, hem_y + 0.02), (hw, r0), 6)[:-1],
                               bez((hw, r0), (hw, r0 + 0.07), (cw, r1 - 0.07), (cw, r1), 40)[:-1],
                               seg((cw, r1), (ax, ay), nside)])
        side = even(side, nside + 6)
    else:
        side = seg((cw, hem_y + 0.02), (ax, ay), nside)
    p.add("sideR", side)
    arm_len = length(bez((ax, ay), arm_c[1], arm_c[0], (sx, sy), 200))
    arm = bez((ax, ay), arm_c[1], arm_c[0], (sx, sy), count(arm_len, 0.014 if sleeved else 0.008))
    p.add("armR", arm)
    p.add("shoulderR", seg((sx, sy), (nw, 0.0), count(math.hypot(sx - nw, sy), 0.008)))
    # neck: right HPS → centre → left HPS
    if spec["neck"] == "v" and face == "front":
        neck = np.concatenate([seg((nw, 0), (0, -nd), count(math.hypot(nw, nd), 0.007))[:-1], seg((0, -nd), (-nw, 0), count(math.hypot(nw, nd), 0.007))])
    else:
        a = np.linspace(0, math.pi, 200)
        neck = even(np.stack([nw * np.cos(a), -nd * np.sin(a)], 1), count(math.pi * (nw + nd) / 2, 0.007))
    p.add("neck", neck)
    p.add("shoulderL", seg((-nw, 0.0), (-sx, sy), count(math.hypot(sx - nw, sy), 0.008)))
    p.add("armL", arm[::-1] * [-1, 1])
    p.add("sideL", side[::-1] * [-1, 1])
    p.meta = dict(cw=cw, L=L, nw=nw, nd=nd, sx=sx, sy=sy, ax=ax, ay=ay, hem=hem_y, sleeved=sleeved)
    return p


def sleeve_piece(armhole_len, n_half, long=False):
    """a set-in sleeve: cap from front armpit corner over the top to the back corner"""
    sw, ch = 0.2, 0.105        # half bicep width, cap height
    sl = 0.47 if long else 0.115   # underarm seam length
    cf = 0.105 if long else 0.178  # half cuff width (a long sleeve tapers to the wrist)
    # fit the cap length to the armhole (+ 1.5 cm ease) by scaling the cap height
    for _ in range(30):
        half = bez((-sw, 0), (-sw * 0.55, 0.0), (-sw * 0.45, ch), (0, ch), 200)
        capL = 2 * length(half)
        target = armhole_len + 0.006
        ch *= 1 + 0.6 * (target - capL) / max(target, 1e-6)
    p = Piece("sleeve", "Sleeve")
    p.add("cuff", seg((-cf * (0.82 if long else 1), -sl), (cf * (0.82 if long else 1), -sl), count(2 * cf, 0.01)))
    nu = count(math.hypot(sw - cf, sl))
    if long:
        # the rib cuff is narrower than the sleeve above it
        k = -sl + 0.075
        ck = cf + (sw - cf) * (0.075 / sl)
        cf = cf * 0.82
        under = even(np.concatenate([seg((cf, -sl), (ck, k), 8)[:-1], seg((ck, k), (sw, 0), nu)]), nu + 6)
    else:
        under = seg((cf, -sl), (sw, 0), nu)
    p.add("underB", under)
    capB = bez((sw, 0), (sw * 0.55, 0.0), (sw * 0.45, ch), (0, ch), n_half)
    capF = bez((0, ch), (-sw * 0.45, ch), (-sw * 0.55, 0.0), (-sw, 0), n_half)
    p.add("capB", capB)      # back corner → top
    p.add("capF", capF)      # top → front corner
    p.add("underF", under[::-1] * [-1, 1])
    p.meta = dict(sw=sw, ch=ch, sl=sl, cf=cf)
    return p


# ---------------------------------------------------------------- bands (pattern space)
class Band:
    """a trim band: the open edge it follows, its inner sewing line, and a seed point inside"""

    def __init__(self, line, seeds):
        self.line = line      # shapely LineString (or MultiLineString), ends on the outline
        self.seeds = seeds    # [(x, y)] points inside the band


def band(piece, tags, width):
    """
    The band's inner edge: the open edge offset into the panel by `width`, with mitred
    corners (a V-neck band ends in a sharp V), stretched to meet the neighbouring
    seams and cut by the panel outline.
    """
    pts, _ = piece.outline()
    poly = Polygon(pts).buffer(0)
    runs = []
    for tag, P in piece.edges:
        if tag in tags:
            if runs and np.allclose(runs[-1][-1], P[0]):
                runs[-1] = np.concatenate([runs[-1], P[1:]])
            else:
                runs.append(P.copy())
    if len(runs) > 1 and np.allclose(runs[-1][-1], runs[0][0]):
        runs[0] = np.concatenate([runs[-1], runs[0][1:]])
        runs.pop()
    lines, seeds = [], []
    for E in runs:
        base = LineString(E)
        off = None
        for sgn in (1, -1):
            o = base.offset_curve(sgn * width, join_style="mitre", mitre_limit=8.0)
            if o.is_empty:
                continue
            if o.geom_type != "LineString":
                o = max(o.geoms, key=lambda g: g.length)
            if poly.contains(o.interpolate(0.5, normalized=True)):
                off = o
                break
        if off is None:
            continue
        C = np.array(off.coords)
        # stretch both ends so they reach the seams, then trim to the panel
        d0 = C[0] - C[1]; d0 /= np.linalg.norm(d0)
        d1 = C[-1] - C[-2]; d1 /= np.linalg.norm(d1)
        C = np.vstack([C[0] + d0 * width * 4, C, C[-1] + d1 * width * 4])
        cut = LineString(C).intersection(poly)
        if cut.geom_type != "LineString":
            cut = max(cut.geoms, key=lambda g: g.length)
        # land each end on the neighbouring seam exactly `width` from the corner, so the
        # front and back bands meet at the same point of a shoulder or side seam
        ring = LineString(np.vstack([pts, pts[:1]]))
        Lr = ring.length
        C = np.array(cut.coords)
        for end, corner, sgn in ((0, E[0], -1), (-1, E[-1], 1)):
            s0 = ring.project(SPoint(*corner))
            target = ring.interpolate((s0 + sgn * width * 1.15) % Lr)
            C[end] = (target.x, target.y)
        cut = LineString(C)
        lines.append(cut)
        mid = base.interpolate(0.5, normalized=True)
        midO = cut.interpolate(cut.project(mid))
        seeds.append(((mid.x + midO.x) / 2, (mid.y + midO.y) / 2))
        # a second seed off-centre (the half panel only keeps x > 0)
        q = base.interpolate(0.3, normalized=True)
        qO = cut.interpolate(cut.project(q))
        seeds.append(((q.x + qO.x) / 2, (q.y + qO.y) / 2))
        q = base.interpolate(0.7, normalized=True)
        qO = cut.interpolate(cut.project(q))
        seeds.append(((q.x + qO.x) / 2, (q.y + qO.y) / 2))
    if not lines:
        return None
    return Band(unary_union(lines), seeds)


def band_segments(bnd, pts, clip=None):
    """the band's inner line as (a, Q, b) chains whose ends sit exactly on outline vertices"""
    if bnd is None:
        return []
    line = bnd.line.intersection(clip) if clip is not None else bnd.line
    out = []
    for g in getattr(line, "geoms", [line]):
        if g.is_empty or g.geom_type != "LineString" or g.length < 0.01:
            continue
        C = np.array(g.coords)
        a = int(np.argmin(np.linalg.norm(pts - C[0], axis=1)))
        b = int(np.argmin(np.linalg.norm(pts - C[-1], axis=1)))
        if a == b:
            continue
        C[0], C[-1] = pts[a], pts[b]
        Q = even(C, count(length(C), 0.007))
        out.append((a, Q[1:-1], b))
    return out


REGION_ID = {"Trim_Neck": 1, "Trim_Arm": 2, "Trim_Hem": 3, "Waistband": 4}
REGION_NAME = {v: k for k, v in REGION_ID.items()}


def region_seeds(bands, half=False):
    out = []
    for name, bnd in bands.items():
        if bnd is None:
            continue
        for x, y in bnd.seeds:
            if half and x <= 0.002:
                continue
            out.append([x, y, REGION_ID[name], 0])
    return out


def triangulate(piece, bands):
    pts, owner = piece.outline()
    n = len(pts)
    V = list(pts)
    Sg = [(k, (k + 1) % n) for k in range(n)]
    for bnd in bands.values():
        for a, Q, b in band_segments(bnd, pts):
            idx = []
            for q in Q:
                V.append(q)
                idx.append(len(V) - 1)
            ch = [a] + idx + [b]
            Sg += list(zip(ch[:-1], ch[1:]))
    data = {"vertices": np.array(V), "segments": np.array(Sg)}
    seeds = region_seeds(bands)
    if seeds:
        data["regions"] = np.array(seeds, float)
    tri = triangle.triangulate(data, f"pq30a{TRI_AREA}YA")
    attr = tri.get("triangle_attributes")
    attr = attr[:, 0].astype(int) if attr is not None else np.zeros(len(tri["triangles"]), int)
    return tri["vertices"], tri["triangles"], n, owner, attr


def sym_triangulate(piece, bands):
    """
    Triangulate the right half and mirror it, so the panel is exactly symmetric:
    every vertex on the right has a twin on the left (used to make the drape
    symmetric afterwards). Returns V, T, outline index → vertex index, mirror, region per triangle.
    """
    from shapely.geometry import box
    pts, owner = piece.outline()
    pts = pts.copy()
    pts[np.abs(pts[:, 0]) < 1e-7, 0] = 0.0
    n = len(pts)
    centre = [i for i in range(n) if pts[i, 0] == 0.0]
    assert len(centre) == 2, ("outline needs a point on the centre line at the neck and the hem", centre)
    i_hem, i_neck = sorted(centre, key=lambda i: pts[i, 1])
    chain = []
    i = i_hem
    while True:
        chain.append(i)
        if i == i_neck:
            break
        i = (i + 1) % n
    half = [pts[k] for k in chain]
    top, bot = pts[i_neck, 1], pts[i_hem, 1]
    stops = [top, bot]
    axis = LineString([(0, top + 1), (0, bot - 1)])
    for bnd in bands.values():
        if bnd is None:
            continue
        cut = bnd.line.intersection(axis)
        for g in getattr(cut, "geoms", [cut]):
            if not g.is_empty and g.geom_type == "Point" and bot + 0.004 < g.y < top - 0.004:
                stops.append(g.y)
    stops = sorted(set(stops), reverse=True)
    cl = []
    for y0, y1 in zip(stops[:-1], stops[1:]):
        cl += list(even(np.array([[0, y0], [0, y1]]), count(y0 - y1, 0.016))[1:])
    cl = np.array(cl[:-1])
    H = np.array(half + list(cl))
    hn = len(H)
    V = [p for p in H]
    Sg = [(k, (k + 1) % hn) for k in range(hn)]
    right = box(0, -10, 10, 10)
    for bnd in bands.values():
        for a, Q, b in band_segments(bnd, H, clip=right):
            idx = []
            for q in Q:
                V.append(q)
                idx.append(len(V) - 1)
            ch = [a] + idx + [b]
            Sg += list(zip(ch[:-1], ch[1:]))
    data = {"vertices": np.array(V), "segments": np.array(Sg)}
    seeds = region_seeds(bands, half=True)
    if seeds:
        data["regions"] = np.array(seeds, float)
    tri = triangle.triangulate(data, f"pq30a{TRI_AREA}YA")
    Vh, Th = tri["vertices"], tri["triangles"]
    attr = tri.get("triangle_attributes")
    attr = attr[:, 0].astype(int) if attr is not None else np.zeros(len(Th), int)
    Vh[np.abs(Vh[:, 0]) < 1e-7, 0] = 0.0
    Vf = list(Vh)
    mirror = list(range(len(Vh)))
    twin = {}
    for k, v in enumerate(Vh):
        if v[0] > 0:
            twin[k] = len(Vf)
            Vf.append(np.array([-v[0], v[1]]))
            mirror[k] = twin[k]
            mirror.append(k)
        else:
            twin[k] = k
    Tf = [tuple(t) for t in Th] + [(twin[c], twin[b], twin[a]) for a, b, c in Th]
    Vf = np.array(Vf)
    look = {(round(v[0], 7), round(v[1], 7)): k for k, v in enumerate(Vf)}
    oidx = []
    for p in pts:
        key = (round(p[0], 7), round(p[1], 7))
        oidx.append(look[key] if key in look else int(np.argmin(np.linalg.norm(Vf - p, axis=1))))
    return Vf, np.array(Tf), oidx, owner, mirror, np.concatenate([attr, attr])


# ---------------------------------------------------------------- placement in 3D
def place_body(P, face):
    """front panel in front of the form, back behind, both bent round the torso"""
    x, y = P[:, 0], P[:, 1]
    if face == "front":
        d = -0.19 + 1.7 * x ** 2
    else:
        d = 0.16 - 1.35 * x ** 2
    return np.stack([x, d, Z_HPS + y], 1)


ARM_A = math.radians(56)
# the form's arms for the drape (held out along the sleeve line; after the drape a hoodie's
# long sleeves are swung down nearer the sides, and the hood is draped round arms at that angle)
ARM = dict(angle=56.0, length=0.3)
# how easily the cloth bends (shorts: a woven polyester that holds its line)
FABRIC = dict(bend=1.0, hood_bend=1.0)


def sleeve_path(sx, s, arm=0.3, bend=0.16):
    """the sleeve's centre line: out along the form's arm, then (a long sleeve) bending down to hang"""
    d = Vector((sx * math.sin(ARM_A), 0, -math.cos(ARM_A)))
    joint = Vector((sx * 0.15, 0, J + 0.24))
    if s <= arm:
        return joint + d * s, d
    c = joint + d * arm
    a0 = ARM_A
    t = min(s - arm, bend)
    # turn from the arm's angle to straight down over `bend` metres
    steps = 24
    p = c.copy()
    for k in range(steps):
        a = a0 * (1 - (k + 0.5) / steps * (t / bend))
        p += Vector((sx * math.sin(a), 0, -math.cos(a))) * (t / steps)
    a = a0 * (1 - t / bend)
    dd = Vector((sx * math.sin(a), 0, -math.cos(a)))
    if s > arm + bend:
        p += dd * (s - arm - bend)
    return p, dd


def place_sleeve(P, side, raglan=False):
    """roll the sleeve into a tube round the form's arm (the underarm seam underneath)"""
    sx = 1 if side == "R" else -1
    back = Vector((0, 1, 0))
    sw = 0.2
    R = (2 * sw) / (2 * math.pi) * 1.12
    ch = P[:, 1].max()
    out = []
    for u, v in P:
        th = (u / sw) * math.pi
        if not raglan:
            s = 0.045 + (ch - v)
            c, t = sleeve_path(sx, s)
            up = Vector((-t.z, 0, t.x)) * sx
            out.append(tuple(c + (up * math.cos(th) + back * math.sin(th)) * R))
            continue
        # raglan: the armpit sits where a set-in sleeve's would; the part above it (the
        # shoulder, up to the neck) is laid as a widening hood over the top of the form,
        # held clear of it so the seams can pull it down onto the shoulder
        s = 0.15 - v
        k = max(0.0, 0.06 - s)
        c, t = sleeve_path(sx, max(s, 0.06))
        up = Vector((-t.z, 0, t.x)) * sx
        c = c + Vector((-sx, 0, 0)) * k * 0.9 + Vector((0, 0, 1)) * k * float(OPT.get("rlift", 0.55))
        Rr = R * (1 + float(OPT.get("rgrow", 0.9)) * k / 0.2)
        out.append(tuple(c + (up * math.cos(th) + back * math.sin(th)) * Rr))
    return np.array(out)


# ---------------------------------------------------------------- build
def build(kit_id, spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fk.MATS.clear()
    order = ["Body", "Sleeve", "Trim_Neck", "Trim_Arm", "Trim_Hem", "Button", "Hood", "Waistband", "Cord"]
    mats = {}
    for name, rgb in (("Body", (0.04, 0.2, 0.65)), ("Sleeve", (0.02, 0.02, 0.02)), ("Trim_Neck", (0.9, 0.9, 0.9)),
                      ("Trim_Arm", (0.9, 0.9, 0.9)), ("Trim_Hem", (0.9, 0.9, 0.9)), ("Button", (0.85, 0.84, 0.8)),
                      ("Hood", (0.04, 0.2, 0.65)), ("Waistband", (0.9, 0.9, 0.9)), ("Cord", (0.9, 0.9, 0.9))):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*rgb, 1)
        b.inputs["Roughness"].default_value = 0.85
        mats[name] = m
    sleeved = spec["sleeves"] != "none"
    long = spec["sleeves"] == "long"
    # (a polo's band lies under the collar: narrow, so it never shows past it)
    neck_w = {"v": 0.024, "crew": 0.022, "polo": 0.012, "hood": None, "zip": 0.012}[spec["neck"]]
    raglan = bool(spec.get("raglan"))
    arm_w = 0.065 if long else 0.02   # a hoodie's rib cuffs and hem are deep
    hem_w = 0.065 if long else 0.028

    front = body_piece(spec, "front")
    back = body_piece(spec, "back")
    pieces = [("front", front), ("back", back)]
    if sleeved:
        armF = dict(front.edges)["armR"]
        armB = dict(back.edges)["armR"]
        alen = length(armF) + length(armB)
        for side in ("R", "L"):
            if raglan:
                pieces.append((f"sleeve{side}", raglan_sleeve_piece(length(armF), length(armB), long)))
            else:
                pieces.append((f"sleeve{side}", sleeve_piece(alen, len(armF), long)))

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rest = {}       # BMVert → (rest xyz, rest normal)
    piece_verts = {}
    twin_of = {}    # BMVert → its mirror twin
    edge_verts = {}  # (piece, tag) → [BMVert in edge order, with end point]
    for pname, piece in pieces:
        bands = {}
        if pname in ("front", "back"):
            if neck_w:  # a hood is sewn straight to the neckline, no band
                bands["Trim_Neck"] = band(piece, {"neck"}, neck_w)
            bands["Trim_Hem"] = band(piece, {"hem"}, hem_w)
            if not sleeved:
                bands["Trim_Arm"] = band(piece, {"armR", "armL"}, arm_w)
        else:
            bands["Trim_Arm"] = band(piece, {"cuff"}, arm_w)
            if raglan and neck_w:  # a raglan sleeve's top is part of the neckline
                bands["Trim_Neck"] = band(piece, {"sneck"}, neck_w)
        # one unconstrained triangulation per panel: a mesh mirrored about a straight
        # centre line folds along it like a hinge
        V, T, n_out, owner, tattr = triangulate(piece, bands)
        oidx = list(range(n_out))
        mirror = None
        if pname in ("front", "back"):
            P3 = place_body(V, pname)
        else:
            P3 = place_sleeve(V, pname[-1], raglan=piece.meta.get("raglan", False))
        verts = [bm.verts.new(tuple(p)) for p in P3]
        piece_verts[pname] = verts
        if mirror is not None:
            for i, m in enumerate(mirror):
                twin_of[verts[i]] = verts[m]
        # remember each outline edge's vertices in order (for sewing)
        k_of = {}
        for i, (k, j) in enumerate(owner):
            k_of.setdefault(k, []).append(oidx[i])
        for k, (tag, Pe) in enumerate(piece.edges):
            ids = k_of[k] + [k_of[(k + 1) % len(piece.edges)][0]]
            edge_verts[(pname, tag)] = [verts[i] for i in ids]
        for i, v in enumerate(verts):
            x, y = V[i]
            if pname == "front":
                rest[v] = ((x / S, y / S + TOP, 0.3), (0, 0, 1))
            elif pname == "back":
                rest[v] = ((x / S, y / S + TOP, -0.3), (0, 0, -1))
            else:
                rest[v] = ((0, 0, 0), (0, 0, 1))
        for ti, (a, b, c) in enumerate(T):
            tri = (verts[a], verts[b], verts[c])
            # face the outside of the garment
            f = bm.faces.new(tri if pname != "back" else tri[::-1])
            cx, cy = (V[a] + V[b] + V[c]) / 3
            name = REGION_NAME.get(int(tattr[ti]), piece.base)
            f.material_index = order.index(name)
            f.smooth = True
            off = {"front": (0, 0), "back": (1.0, 0), "sleeveR": (0, 1.0), "sleeveL": (1.0, 1.0)}[pname]
            for lp, idx in zip(f.loops, (a, b, c) if pname != "back" else (c, b, a)):
                u, w = V[idx]
                lp[uv_layer].uv = (u / S / 4 + 0.5 + off[0] * 0.0, w / S / 4 + 0.5 + off[1] * 0.0)

    # sewing threads: loose edges between matching seam points
    def sew(a_key, b_key, rev=False):
        A, B = edge_verts[a_key], edge_verts[b_key]
        if rev:
            B = B[::-1]
        assert len(A) == len(B), (a_key, b_key, len(A), len(B))
        for va, vb in zip(A, B):
            if va is not vb and not bm.edges.get((va, vb)):
                bm.edges.new((va, vb))

    if not raglan:
        sew(("front", "shoulderR"), ("back", "shoulderR"))
        sew(("front", "shoulderL"), ("back", "shoulderL"))
    sew(("front", "sideR"), ("back", "sideR"))
    sew(("front", "sideL"), ("back", "sideL"))
    if sleeved:
        # cap: front corner → top runs with the front armhole armpit → shoulder; top → back corner with the back armhole
        for side, sl in (("R", "sleeveR"), ("L", "sleeveL")):
            armF = ("front", f"arm{side}")
            armB = ("back", f"arm{side}")
            # armR runs armpit→shoulder; armL runs shoulder→armpit
            sew((sl, "capF"), armF, rev=(side == "R"))
            sew((sl, "capB"), armB, rev=(side == "L"))
            sew((sl, "underF"), (sl, "underB"), rev=True)

    if sleeved:
        for vr, vl in zip(piece_verts["sleeveR"], piece_verts["sleeveL"]):
            twin_of[vr] = vl
            twin_of[vl] = vr
    me = bpy.data.meshes.new(f"{kit_id}_mesh")
    # stash rest before writing
    rest_co = [None] * len(bm.verts)
    bm.verts.index_update()
    twin_idx = {v.index: (twin_of[v].index if v in twin_of else -1) for v in bm.verts}
    for v in bm.verts:
        rest_co[v.index] = rest.get(v, ((0, 0, 0), (0, 0, 1)))
    bm.to_mesh(me)
    bm.free()
    for nm in order:
        me.materials.append(mats[nm])
    ra = me.attributes.new("_rest", "FLOAT_VECTOR", "POINT")
    rn = me.attributes.new("_restn", "FLOAT_VECTOR", "POINT")
    for i, (co, nn) in enumerate(rest_co):
        ra.data[i].vector = co
        rn.data[i].vector = nn
    tw = me.attributes.new("twin", "INT", "POINT")
    for v, t in twin_idx.items():
        tw.data[v].value = t
    ob = bpy.data.objects.new("Jersey", me)
    bpy.context.collection.objects.link(ob)
    return ob, mats, order, front, back, sleeved, (neck_w, arm_w, hem_w)


def simulate(ob, sleeved, frames=120, settle_only=False, rib_shrink=0.0, shorts=False, self_collide=False):
    fk.materials()
    if shorts:
        form = lower_form(bpy.context.collection)
    else:
        form = fk.dress_form(bpy.context.collection, arms=sleeved, arm_len=ARM["length"], arm_angle=ARM["angle"])
    form.modifiers.new("Collision", "COLLISION")
    form.collision.thickness_outer = 0.004
    form.collision.thickness_inner = 0.02
    form.collision.cloth_friction = 5
    # the neck band is a firm rib knit: it holds the neckline (a V would otherwise sag and
    # buckle the whole front)
    me = ob.data
    neck_idx = [i for i, m in enumerate(me.materials) if m.name.startswith(("Trim_Neck", "Waistband"))]
    firm = sorted({v for p in me.polygons if p.material_index in neck_idx for v in p.vertices})
    vg = ob.vertex_groups.new(name="firm")
    vg.add(firm, 1.0, "REPLACE")
    # the cuff/armhole and hem bands are rib too, a little softer than the collar
    rib_idx = [i for i, m in enumerate(me.materials) if m.name.startswith(("Trim_Arm", "Trim_Hem"))]
    rib = sorted({v for p in me.polygons if p.material_index in rib_idx for v in p.vertices} - set(firm))
    vg.add(rib, 0.45, "REPLACE")
    if rib_shrink:
        # a hoodie's rib is knitted smaller than the body it finishes: it gathers it in
        sg = ob.vertex_groups.new(name="shrink")
        sg.add(sorted({v for p in me.polygons if p.material_index in rib_idx for v in p.vertices}), 1.0, "REPLACE")
    # a front hangs flat from the chest: stiffen a strip down the centre so it can't pleat
    ra = me.attributes["_rest"]
    if not shorts:
        strip = [i for i, d in enumerate(ra.data) if d.vector[2] > 0.1 and abs(d.vector[0]) < 0.25 and i not in set(firm)]
        vg.add(strip, 0.18, "REPLACE")
    if shorts:
        # the elastic waistband holds the shorts up: it stays where it was put, round the form's waist
        wb_i = [i for i, m in enumerate(me.materials) if m.name.startswith("Waistband")]
        pg = ob.vertex_groups.new(name="pin")
        pg.add(sorted({v for p in me.polygons if p.material_index in wb_i for v in p.vertices}), 1.0, "REPLACE")
    cl = ob.modifiers.new("Cloth", "CLOTH")
    st = cl.settings
    if shorts:
        st.vertex_group_mass = "pin"
        st.pin_stiffness = 1.0
    if rib_shrink:
        st.vertex_group_shrink = "shrink"
        st.shrink_min = 0.0
        st.shrink_max = rib_shrink
    st.vertex_group_structural_stiffness = "firm"
    st.tension_stiffness_max = 250
    st.compression_stiffness_max = 250
    st.vertex_group_shear_stiffness = "firm"
    st.shear_stiffness_max = 80
    st.vertex_group_bending = "firm"
    st.bending_stiffness_max = 8
    st.quality = 12
    st.mass = 0.15
    st.tension_stiffness = 25
    st.compression_stiffness = 25
    st.shear_stiffness = 15
    st.bending_stiffness = FABRIC["bend"]
    st.air_damping = 3.0
    st.use_sewing_springs = True
    st.sewing_force_max = 8.0
    cs = cl.collision_settings
    cs.collision_quality = 6
    cs.distance_min = 0.004
    cs.use_self_collision = self_collide
    cs.self_distance_min = 0.003
    cs.self_friction = 3
    # sew first with little gravity, then let it hang
    ew = st.effector_weights
    if not settle_only:
        ew.gravity = 0.0
        ew.keyframe_insert("gravity", frame=1)
        ew.keyframe_insert("gravity", frame=30)
        ew.gravity = 1.0
        ew.keyframe_insert("gravity", frame=50)
    else:
        st.use_sewing_springs = False
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = frames
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
        if TRACE and f % 5 == 0:
            e = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
            zs = [v.co.z for v in e.data.vertices]
            print(f"  frame {f}: z {min(zs):.3f}..{max(zs):.3f}", flush=True)
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=cl.name)
    sc.frame_set(1)
    bpy.data.objects.remove(form)
    for n in [o.name for o in bpy.data.objects if o.name.startswith(("form_stand",) + LOWER_NAMES)]:
        bpy.data.objects.remove(bpy.data.objects[n])
    ob.vertex_groups.clear()
    if ob.animation_data:
        ob.animation_data_clear()


def symmetrize(ob):
    """
    A sewn shirt on a symmetric form hangs symmetrically. Every body vertex is averaged
    with the mirror image of the drape at its mirrored pattern position (sampled from
    the panel's own triangles), and each sleeve vertex with its twin on the other
    sleeve; this also cancels one-sided simulation glitches.
    """
    from mathutils.kdtree import KDTree
    from mathutils.geometry import barycentric_transform, intersect_point_tri_2d
    me = ob.data
    twin = [d.value for d in me.attributes["twin"].data]
    me.attributes.remove(me.attributes["twin"])
    rest = [Vector(d.vector) for d in me.attributes["_rest"].data]
    cur = [v.co.copy() for v in me.vertices]
    new = [c.copy() for c in cur]
    mark = [0] * len(me.vertices)
    for side in (1, -1):
        faces = [p.vertices[:] for p in me.polygons if all(rest[i].z * side > 0.1 for i in p.vertices)]
        if not faces:
            continue
        kd = KDTree(len(faces))
        for k, f in enumerate(faces):
            kd.insert(sum((Vector((rest[i].x, rest[i].y, 0)) for i in f), Vector()) / 3, k)
        kd.balance()
        verts = {i for f in faces for i in f}
        for i in verts:
            q = Vector((-rest[i].x, rest[i].y, 0))
            hit = None
            for _, k, _ in kd.find_n(q, 16):
                a, b, c = (Vector((rest[j].x, rest[j].y, 0)) for j in faces[k])
                if intersect_point_tri_2d(q, a, b, c):
                    hit = faces[k]
                    break
            if hit is None:  # on the outline: nearest triangle is close enough
                hit = faces[kd.find(q)[1]]
            A, B, C = (Vector((rest[j].x, rest[j].y, 0)) for j in hit)
            p = barycentric_transform(q, A, B, C, cur[hit[0]], cur[hit[1]], cur[hit[2]])
            m = Vector((-p.x, p.y, p.z))
            new[i] = (cur[i] + m) / 2
            if abs(rest[i].x) < 0.2:
                mark[i] = 1
    for i, t in enumerate(twin):
        if t >= 0 and t != i:
            o = cur[t]
            new[i] = (cur[i] + Vector((-o.x, o.y, o.z))) / 2
    for v, p in zip(me.vertices, new):
        v.co = p
    centre = me.attributes.new("centre", "INT", "POINT")
    for i, m in enumerate(mark):
        centre.data[i].value = m
    me.update()


def weld(ob):
    """close the seams: every group of points joined by threads (an armpit joins four
    pieces) moves to its common centre and becomes one vertex; the threads go"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # before taking any references: adding a layer reallocates (a second weld reuses it)
    seam = bm.verts.layers.int.get("seam") or bm.verts.layers.int.new("seam")
    loose = [e for e in bm.edges if not e.link_faces]
    gap = max((e.calc_length() for e in loose), default=0)
    parent = {}

    def find(v):
        while parent.get(v, v) is not v:
            parent[v] = parent.get(parent[v], parent[v])
            v = parent[v]
        return v

    for e in loose:
        a, b = (find(x) for x in e.verts)
        if a is not b:
            parent[a] = b
    groups = {}
    for v in {v for e in loose for v in e.verts}:
        groups.setdefault(find(v), []).append(v)
    bmesh.ops.delete(bm, geom=loose, context="EDGES")
    targetmap = {}
    rest_l = bm.verts.layers.float_vector.get("_rest")
    for root, vs in groups.items():
        c = sum((v.co for v in vs), Vector()) / len(vs)
        # the merged point keeps a body panel's print coordinates when it has one: a sleeve
        # point (which has none) would drag the chest print into the armhole seam
        body = [v for v in vs if rest_l is not None and abs(v[rest_l].z) > 0.1]
        keep = body[0] if body else vs[0]
        vs = [keep] + [v for v in vs if v is not keep]
        keep.co = c
        keep[seam] = 1
        for v in vs[1:]:
            targetmap[v] = keep
    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return gap



# ---------------------------------------------------------------- long sleeves down
def lower_sleeves(ob, a0, a1):
    """
    Swing the draped sleeves down from a0 to a1 degrees (from the vertical) about the
    shoulder joints, the way a rig poses a model: each sleeve point turns by an amount that
    eases in from the armhole, so the cap stays sewn in and the rest of the sleeve comes
    down whole. A short settle afterwards lets the fleece fold under the arm.
    """
    me = ob.data
    slv = {i for i, m in enumerate(me.materials) if m.name.split(".")[0] in ("Sleeve", "Trim_Arm")}
    on = {v for p in me.polygons if p.material_index in slv for v in p.vertices}
    off = {v for p in me.polygons if p.material_index not in slv for v in p.vertices}
    da = math.radians(a0 - a1)
    for v in me.vertices:
        if v.index not in on or v.index in off:
            continue
        p = v.co
        sx = 1 if p.x > 0 else -1
        joint = Vector((sx * 0.15, 0.0, J + 0.24))
        d = Vector((sx * math.sin(math.radians(a0)), 0.0, -math.cos(math.radians(a0))))
        s_ = (p - joint).dot(d)
        t = min(max((s_ - 0.03) / 0.13, 0.0), 1.0)
        w = t * t * (3 - 2 * t)
        # right arm: turning toward -z is a positive turn about +y; mirrored on the left
        R = Matrix.Rotation(sx * da * w, 3, "Y")
        v.co = joint + R @ (p - joint)
    me.update()


# ---------------------------------------------------------------- the hood (hoodie)
def mat_index(me, name):
    return next(i for i, m in enumerate(me.materials) if m.name.split(".")[0] == name)


def arc_param(pts):
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    return np.array(d)


def at_param(pts, L, t):
    """point at arc length t along polyline pts (cumulative lengths L)"""
    t = min(max(t, 0.0), L[-1])
    k = int(np.searchsorted(L, t))
    k = min(max(k, 1), len(pts) - 1)
    a, b = pts[k - 1], pts[k]
    s_ = (t - L[k - 1]) / max(L[k] - L[k - 1], 1e-9)
    return a.lerp(b, s_)


def hood_piece(Lh, frac, H=0.38):
    """one side of a two-piece hood: neck edge (centre front → centre back), crown seam, face opening"""
    p = Piece("hood", "Hood")
    p.add("neck", np.array([(-Lh * f, 0.0) for f in frac]))
    crown = bez((-Lh, 0), (-Lh - 0.045, 0.2), (-Lh * 0.6, H + 0.04), (0.012, H), 200)
    p.add("crown", even(crown, count(length(crown), 0.016)))
    opening = bez((0.012, H), (0.045, H * 0.62), (0.035, 0.14), (0.0, 0.0), 200)
    p.add("opening", even(opening, count(length(opening), 0.014)))
    return p


HOOD_WIND = 9.0


def hood_stage(ob):
    """
    Cut the hood to the draped neckline, sew it on and let it fall back onto the
    shoulders. The finished shirt is pinned, so only the hood moves; it collides with
    the shirt (self collision) and the form.
    """
    me = ob.data
    n_body = len(me.vertices)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    neck = max(open_edges(bm), key=lambda l: sum(v.co.z for v in l) / len(l))
    P = [v.co.copy() for v in neck]
    n = len(P)
    i0 = min(range(n), key=lambda i: P[i].y + 3 * abs(P[i].x))   # centre front
    iB = max(range(n), key=lambda i: P[i].y - 3 * abs(P[i].x))   # centre back
    yc = sum(p.y for p in P) / n

    def arc(step):
        out, i = [i0], i0
        while i != iB:
            i = (i + step) % n
            out.append(i)
        return out
    sides = {}
    for a in (arc(1), arc(-1)):
        sides[-1 if sum(P[i].x for i in a) < 0 else 1] = a
    hood_mat, band_mat = mat_index(me, "Hood"), mat_index(me, "Trim_Neck")
    uv_layer = bm.loops.layers.uv.verify()
    al = math.radians(42)   # the hood starts up, leaning back
    up = Vector((0, math.sin(al), math.cos(al)))
    crowns = {}
    threads = []
    for sx, a in sides.items():
        pts = [P[i] for i in a]
        L = arc_param(pts)
        Lh = float(L[-1])
        piece = hood_piece(Lh, L / L[-1])
        bands = {"Trim_Neck": band(piece, {"opening"}, 0.032)}
        V, T, n_out, owner, tattr = triangulate(piece, bands)
        verts = []
        for u, v in V:
            f = min(max(-u / Lh, 0.0), 1.0)
            N = at_param(pts, L, f * Lh)
            r = Vector((N.x, N.y - yc, 0))
            r = r.normalized() if r.length > 1e-6 else Vector((0, 1, 0))
            # the face opening stands open (the two panels never start inside each other)
            side = Vector((sx * 0.085 * (1 - f) ** 2 * min(1.0, max(v, 0.0) / 0.08), 0, 0))
            verts.append(bm.verts.new(N + r * 0.012 + up * max(v, 0.0) + side))
        for ti, (i, j, k) in enumerate(T):
            tri = (verts[i], verts[j], verts[k]) if sx > 0 else (verts[k], verts[j], verts[i])
            fc = bm.faces.new(tri)
            fc.material_index = band_mat if int(tattr[ti]) == REGION_ID["Trim_Neck"] else hood_mat
            fc.smooth = True
            for lp in fc.loops:
                lp[uv_layer].uv = (0.5, 0.5)
        k_of = {}
        for idx, (k, j) in enumerate(owner):
            k_of.setdefault(k, []).append(idx)
        ev = {}
        for k, (tag, _) in enumerate(piece.edges):
            ids = k_of[k] + [k_of[(k + 1) % len(piece.edges)][0]]
            ev[tag] = [verts[i] for i in ids]
        # the neck edge has one point per neckline point: sew them pairwise
        assert len(ev["neck"]) == len(a), (len(ev["neck"]), len(a))
        for hv, i in zip(ev["neck"], a):
            threads.append((hv, neck[i]))
        crowns[sx] = ev["crown"]
    assert len(crowns[1]) == len(crowns[-1])
    for va, vb in zip(crowns[1], crowns[-1]):
        threads.append((va, vb))
    for va, vb in threads:
        if va is not vb and not bm.edges.get((va, vb)):
            bm.edges.new((va, vb))
    bm.to_mesh(me)
    bm.free()
    me.update()
    simulate_pinned(ob, n_body, wind=HOOD_WIND)
    weld(ob)


def simulate_pinned(ob, n_pin, frames=200, wind=0.0):
    """drape what was added after the first n_pin vertices; the rest stays where it is"""
    fk.materials()
    form = fk.dress_form(bpy.context.collection, arms=True, arm_len=ARM["length"], arm_angle=ARM["angle"])
    form.modifiers.new("Collision", "COLLISION")
    form.collision.thickness_outer = 0.004
    form.collision.thickness_inner = 0.02
    form.collision.cloth_friction = 5
    vg = ob.vertex_groups.new(name="pin")
    vg.add(list(range(n_pin)), 1.0, "REPLACE")
    # the hood's edge band holds its line like the rib it is
    me = ob.data
    band_i = {i for i, m in enumerate(me.materials) if m.name.startswith("Trim_Neck")}
    firm = sorted({v for p in me.polygons if p.material_index in band_i for v in p.vertices if v >= n_pin})
    fg = ob.vertex_groups.new(name="firm")
    fg.add(firm, 1.0, "REPLACE")
    cl = ob.modifiers.new("Cloth", "CLOTH")
    st = cl.settings
    st.vertex_group_mass = "pin"
    st.pin_stiffness = 1.0
    st.vertex_group_structural_stiffness = "firm"
    st.tension_stiffness_max = 250
    st.compression_stiffness_max = 250
    st.vertex_group_bending = "firm"
    st.bending_stiffness_max = 4
    st.quality = 12
    st.mass = 0.2
    st.tension_stiffness = 30
    st.compression_stiffness = 30
    st.shear_stiffness = 15
    st.bending_stiffness = FABRIC["hood_bend"]
    st.air_damping = 3.0
    st.use_sewing_springs = True
    st.sewing_force_max = 8.0
    cs = cl.collision_settings
    cs.collision_quality = 6
    cs.distance_min = 0.004
    cs.use_self_collision = True
    cs.self_distance_min = 0.004
    cs.self_friction = 5
    ew = st.effector_weights
    ew.gravity = 0.0
    ew.keyframe_insert("gravity", frame=1)
    ew.keyframe_insert("gravity", frame=25)
    ew.gravity = 1.0
    ew.keyframe_insert("gravity", frame=45)
    fld = None
    if wind:
        # a breeze from the front lays the hood back over the shoulders, then drops
        fld = bpy.data.objects.new("wind", None)
        bpy.context.collection.objects.link(fld)
        fld.location = (0, -0.6, Z_HPS + 0.1)
        fld.rotation_euler = (math.radians(-135), 0, 0)  # blowing back and down
        bpy.context.view_layer.objects.active = fld
        with bpy.context.temp_override(object=fld, active_object=fld):
            bpy.ops.object.forcefield_toggle()
        fld.field.type = "WIND"
        fld.field.flow = 0
        for fr, val in ((1, 0.0), (28, 0.0), (36, wind), (110, wind), (125, 0.0)):
            fld.field.strength = val
            fld.field.keyframe_insert("strength", frame=fr)
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = frames
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=cl.name)
    sc.frame_set(1)
    bpy.data.objects.remove(form)
    for n in [o.name for o in bpy.data.objects if o.name.startswith("form_stand")]:
        bpy.data.objects.remove(bpy.data.objects[n])
    if fld:
        bpy.data.objects.remove(fld)
    ob.vertex_groups.clear()
    if ob.animation_data:
        ob.animation_data_clear()


def tube(out, pts, radius, mat, segs=10, cap=True):
    """a round tube along a polyline (parallel-transported frames)"""
    pts = [Vector(p) for p in pts]
    t0 = (pts[1] - pts[0]).normalized()
    nrm = t0.orthogonal().normalized()
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        rings.append([out.verts.new(p + (nrm * math.cos(2 * math.pi * k / segs) + b * math.sin(2 * math.pi * k / segs)) * radius) for k in range(segs)])
    for r1, r2 in zip(rings, rings[1:]):
        for k in range(segs):
            f = out.faces.new((r1[k], r1[(k + 1) % segs], r2[(k + 1) % segs], r2[k]))
            f.material_index = mat
            f.smooth = True
    if cap:
        for r in (rings[0][::-1], rings[-1]):
            f = out.faces.new(r)
            f.material_index = mat
            f.smooth = True


def eyelet_cord(out, bvh, c, nm, length, x0=None, swing=0.0):
    """a metal eyelet at c (lying on the surface with normal nm) and a cord hanging from
    it down the garment, kept just outside the fabric, ending in an aglet"""
    cord_i, btn_i = 0, 1
    ax = nm.to_track_quat("Z", "Y").to_matrix()
    pts = [c + ax @ Vector((math.cos(a) * 0.0042, math.sin(a) * 0.0042, 0.0006)) for a in np.linspace(0, 2 * math.pi, 25)]
    tube(out, pts, 0.0012, btn_i, segs=8, cap=False)
    x0 = c.x if x0 is None else x0
    path = [c + nm * 0.002]
    p = c + nm * 0.006
    steps = max(8, int(length / 0.0075))
    for s_ in range(steps):
        k = s_ / steps
        z = p.z - length / steps  # always down: a cord hangs
        p = Vector((x0 * (1 - 0.15 * k) + swing * k, p.y, z))
        hit = bvh.find_nearest(p)
        if hit[0] is not None:
            hn = hit[1] if hit[1].y < 0 else -hit[1]
            p = hit[0] + hn * 0.0055
            p.z = z
        path.append(p.copy())
    for _ in range(6):
        path = [path[0]] + [(path[i - 1] + path[i] * 2 + path[i + 1]) / 4 for i in range(1, len(path) - 1)] + [path[-1]]
    tube(out, path, 0.0028, cord_i, segs=10)
    t = (path[-1] - path[-2]).normalized()
    tube(out, [path[-1] - t * 0.004, path[-1] + t * 0.022], 0.0036, btn_i, segs=10)


def hoodie_details(ob):
    """the kangaroo pocket (printed like the front it covers), eyelets and drawcords"""
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform, intersect_point_tri
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    rest_l = bm.verts.layers.float_vector.get("_rest")
    hem_i = mat_index(me, "Trim_Hem")
    band_i = mat_index(me, "Trim_Neck")
    body_i = mat_index(me, "Body")
    # the pocket sits on the rib's top edge, centred on the front
    rib_top = max(v.co.z for f in bm.faces if f.material_index == hem_i for v in f.verts if v.co.y < 0 and abs(v.co.x) < 0.08)
    z0, z1 = rib_top + 0.002, rib_top + 0.2

    def rest_at(fi, p):
        f = bm.faces[fi]
        vs = f.verts
        for tri in ((vs[0], vs[1], vs[2]), (vs[0], vs[2], vs[3]) if len(vs) > 3 else None):
            if tri is None:
                continue
            a, b, c = (v.co for v in tri)
            q = barycentric_transform(p, a, b, c, *(Vector(v[rest_l]) for v in tri))
            return q
        return Vector(vs[0][rest_l])

    out = bmesh.new()
    pr = out.verts.layers.float_vector.new("_rest")
    pn = out.verts.layers.float_vector.new("_restn")
    nu, nv = 30, 16
    grid = []
    for j in range(nv + 1):
        t = j / nv
        z = z0 + (z1 - z0) * t
        # the side openings curve in toward the top
        xh = 0.125 + 0.07 * (1 - t) ** 1.6
        row = []
        for i in range(nu + 1):
            x = -xh + 2 * xh * i / nu
            hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
            p = hit[0] if hit[0] is not None else Vector((x, -0.14, z))
            nm = hit[1] if hit[1] is not None else Vector((0, -1, 0))
            if nm.y > 0:
                nm = -nm
            lift = 0.0024 + 0.0035 * math.sin(math.pi * i / nu) * math.sin(math.pi * t)
            v = out.verts.new(p + nm * lift)
            r = rest_at(hit[2], hit[0]) if hit[0] is not None else Vector((x / S, (z - Z_HPS) / S + TOP, 0.3))
            v[pr] = (r.x, r.y, 0.3)
            v[pn] = (0, 0, 1)
            row.append(v)
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            f = out.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
    pme = bpy.data.meshes.new("pocket")
    out.to_mesh(pme)
    out.free()
    pocket = bpy.data.objects.new("pocket", pme)
    bpy.context.collection.objects.link(pocket)
    lining = bpy.data.materials.get("Lining") or bpy.data.materials.new("Lining")
    lining.use_nodes = True
    lining.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1)
    pme.materials.append(me.materials[body_i])
    pme.materials.append(lining)
    sol = pocket.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.0018
    sol.offset = -1
    sol.material_offset = 1
    sol.material_offset_rim = 0
    sub = pocket.modifiers.new("s", "SUBSURF")
    sub.levels = 1
    apply_all(pocket)

    # eyelets and drawcords at the foot of the hood's opening
    loops = open_edges(bm)
    opening = max(loops, key=lambda l: sum(1 for v in l for f in v.link_faces if f.material_index == band_i))
    F = min(opening, key=lambda v: v.co.y + 2 * abs(v.co.x))  # the centre front of the neck
    out = bmesh.new()
    cord_i, btn_i = 0, 1
    n = len(opening)
    k0 = opening.index(F)
    for step in (1, -1):
        # walk ~5.5 cm up the opening edge from the centre front
        d, k = 0.0, k0
        while d < 0.055:
            k2 = (k + step) % n
            d += (opening[k2].co - opening[k].co).length
            k = k2
        v = opening[k]
        inward = Vector()
        for f in v.link_faces:
            inward += f.calc_center_median() - v.co
        nm = v.normal.copy()
        if nm.dot(Vector((v.co.x, v.co.y - 0.0, 0))) < 0 and v.co.y < 0:
            nm = -nm
        inward -= nm * inward.dot(nm)
        inward = inward.normalized() if inward.length > 1e-9 else Vector((0, 0, -1))
        c = v.co + inward * 0.014 + nm * 0.0015
        eyelet_cord(out, bvh, c, nm, 0.30, x0=c.x, swing=0.0)
    cme = bpy.data.meshes.new("cords")
    out.to_mesh(cme)
    out.free()
    cords = bpy.data.objects.new("cords", cme)
    bpy.context.collection.objects.link(cords)
    cme.materials.append(me.materials[mat_index(me, "Cord")])
    cme.materials.append(me.materials[mat_index(me, "Button")])
    bm.free()
    return [pocket, cords]


# ---------------------------------------------------------------- finishing
def apply_all(ob):
    with bpy.context.temp_override(object=ob, active_object=ob):
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def face_outward(ob, legs=False):
    """consistent normals pointing away from the body's centre line (each thigh's, for shorts)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    score = 0.0
    for f in bm.faces:
        c = f.calc_center_median()
        r = Vector((c.x, c.y, 0))
        if legs:
            if c.z < Z_WAIST - 0.24:
                r = Vector((c.x - math.copysign(0.1, c.x), c.y, 0))
        elif abs(c.x) > 0.24:  # on the sleeves, measure from the arm instead
            r = Vector((0, c.y, 0))
        score += f.normal.dot(r) * f.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def open_edges(bm):
    bm.verts.ensure_lookup_table()
    adj = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [n for n in adj[cur] if n is not prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(cur)
        if len(loop) > 6:
            loops.append(loop)
    return loops


def tidy_edges(ob, rounds=14):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    neck_mats = {i for i, m in enumerate(ob.data.materials) if m.name.startswith("Trim_Neck")}
    for loop in open_edges(bm):
        n = len(loop)
        on = set(loop)
        # only the neckline has a real corner (the V); armholes and hems are smooth curves
        keep_corners = sum(1 for v in loop for f in v.link_faces if f.material_index in neck_mats) > len(loop)
        for _ in range(rounds):
            P = [v.co.copy() for v in loop]
            for i, v in enumerate(loop):
                a_, b_ = (P[i - 1] - P[i]), (P[(i + 1) % n] - P[i])
                if keep_corners and a_.length > 1e-9 and b_.length > 1e-9 and a_.angle(b_) < math.radians(125):
                    continue  # a real corner (the V of the neck): keep it sharp
                d = ((P[i - 1] + P[(i + 1) % n]) * 0.5 - P[i]) * 0.5
                v.co += d
                for e in v.link_edges:
                    o = e.other_vert(v)
                    if o not in on:
                        o.co += d * 0.5
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def tidy_band_lines(ob, rounds=10):
    """straighten the lines where a band is sewn to the body (the drape leaves them ragged)"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    band = {i for i, m in enumerate(ob.data.materials) if m.name.startswith(("Trim_", "Waistband"))}
    line = [e for e in bm.edges if len(e.link_faces) == 2 and (e.link_faces[0].material_index in band) != (e.link_faces[1].material_index in band)]
    adj = {}
    for e in line:
        a, b = e.verts
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    for _ in range(rounds):
        P = {v: v.co.copy() for v in adj}
        for v, nb in adj.items():
            if len(nb) != 2 or v.is_boundary:
                continue  # chain ends (on an opening) and junctions stay put
            d = ((P[nb[0]] + P[nb[1]]) * 0.5 - P[v]) * 0.5
            v.co += d
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in adj:
                    o.co += d * 0.4
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return len(adj)


def stitch_grooves(ob, depth=0.0009):
    """a shallow groove where each band is sewn on: the line between trim and body faces"""
    me = ob.data
    trim = {i for i, m in enumerate(me.materials) if m.name.startswith("Trim_")}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    line = []
    for v in bm.verts:
        kinds = {f.material_index in trim for f in v.link_faces}
        if len(kinds) == 2 and not v.is_boundary:
            line.append(v)
    for v in line:
        v.co -= v.normal * depth
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(line)


def rolled_edges(ob, T, r):
    """a turned, rolled edge on every opening, built on the cut edge itself"""
    bm0 = bmesh.new()
    bm0.from_mesh(ob.data)
    bm0.normal_update()
    out = bmesh.new()
    arc = 10
    for loop in open_edges(bm0):
        n = len(loop)
        mats = [f.material_index for v in loop for f in v.link_faces]
        mi = max(set(mats), key=mats.count)
        P = [v.co.copy() for v in loop]
        N, D = [], []
        for i, v in enumerate(loop):
            nm = v.normal.copy()
            t = (P[(i + 1) % n] - P[i - 1]).normalized()
            d = Vector()
            for f in v.link_faces:
                d += f.calc_center_median() - v.co
            d -= t * d.dot(t)
            d -= nm * d.dot(nm)
            N.append(nm)
            D.append(d.normalized() if d.length > 1e-9 else Vector())
        for _ in range(8):
            N = [(N[i - 1] + N[i] * 2 + N[(i + 1) % n]).normalized() for i in range(n)]
            D = [(D[i - 1] + D[i] * 2 + D[(i + 1) % n]).normalized() for i in range(n)]
        rings = []
        for i in range(n):
            nm, d = N[i], D[i]
            c = P[i] - nm * (T / 2)
            pts = [P[i] + d * 0.006 + nm * 0.0004]
            for k in range(arc + 1):
                th = math.pi * k / arc
                pts.append(c + nm * (math.cos(th) * (T / 2 + r * 0.4)) - d * (math.sin(th) * r))
            pts.append(P[i] + d * 0.006 - nm * (T + 0.0004))
            rings.append([out.verts.new(p) for p in pts])
        m = len(rings[0])
        for i in range(n):
            r1, r2 = rings[i], rings[(i + 1) % n]
            for k in range(m - 1):
                f = out.faces.new((r1[k], r1[k + 1], r2[k + 1], r2[k]))
                f.material_index = mi
                f.smooth = True
    bm0.free()
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    me = bpy.data.meshes.new("rolls")
    out.to_mesh(me)
    out.free()
    for mt in ob.data.materials:
        me.materials.append(mt)
    roll = bpy.data.objects.new("rolls", me)
    bpy.context.collection.objects.link(roll)
    return roll


def relax(ob, idx, factor, iterations, border=None, tangent=True):
    """explicit umbrella smoothing of the given vertices (boundary ones by `border`), along
    the surface only, so a tube (a rib) evens out without shrinking"""
    me = ob.data
    me.update()
    nrm = np.array([v.normal[:] for v in me.vertices])
    n = len(me.vertices)
    co = np.array([v.co[:] for v in me.vertices])
    adj = [[] for _ in range(n)]
    ecount = {}
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    for p in me.polygons:
        for k in p.edge_keys:
            ecount[k] = ecount.get(k, 0) + 1
    bnd = set()
    for (a, b), c in ecount.items():
        if c == 1:
            bnd.update((a, b))
    idx = list(idx)
    w = np.array([(border if border is not None else factor) if i in bnd else factor for i in idx])[:, None]
    for _ in range(iterations):
        if border is not None:
            # a boundary point averages along the boundary only, so the edge stays put in its plane
            avg = np.array([co[[j for j in adj[i] if j in bnd] or adj[i]].mean(0) if i in bnd else co[adj[i]].mean(0) for i in idx])
        else:
            avg = np.array([co[adj[i]].mean(0) for i in idx])
        d = avg - co[idx]
        if tangent:
            nn = nrm[idx]
            d -= nn * (d * nn).sum(1, keepdims=True)
        co[idx] += d * w
    for i in idx:
        me.vertices[i].co = co[i]
    me.update()


def soften_seams(ob, rings=3, iterations=8, plain=False):
    """seams are where the simulation leaves a crease; relax the fabric along them"""
    me = ob.data
    at = me.attributes.get("seam")
    if not at:
        return 0
    on = {i for i, d in enumerate(at.data) if d.value}
    ce = me.attributes.get("centre")
    if ce:
        on |= {i for i, d in enumerate(ce.data) if d.value}
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    grow = set(on)
    for _ in range(rings):
        grow |= {n for i in grow for n in adj[i]}
    if plain:
        # the implicit Laplacian solver tears the hoodie's and the shorts' seams: umbrella smoothing
        relax(ob, sorted(grow), 0.5, iterations, border=0.2, tangent=False)
        for nm in ("seam", "centre"):
            if nm in ob.data.attributes:
                ob.data.attributes.remove(ob.data.attributes[nm])
        return len(grow)
    vg = ob.vertex_groups.new(name="seams")
    vg.add(sorted(grow), 1.0, "REPLACE")
    # plain smoothing (corrective smooth would keep the crease, it preserves detail)
    weights = {}
    for i in grow:
        weights[i] = 1.0
    vg.add(sorted(grow), 1.0, "REPLACE")
    sm = ob.modifiers.new("seams", "LAPLACIANSMOOTH")
    sm.lambda_factor = 0.6
    sm.lambda_border = 0.0
    sm.iterations = iterations
    sm.use_volume_preserve = True
    sm.use_normalized = True
    sm.vertex_group = "seams"
    apply_all(ob)
    ob.vertex_groups.clear()
    for nm in ("seam", "centre"):
        if nm in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes[nm])
    return len(grow)


def polo_details(ob):
    """
    The polo's knitted collar (a stand that folds over into a fall, spreading into
    points at the front), the button placket and two buttons, built on the draped shirt.
    """
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    loops = open_edges(bm)
    neck = max(loops, key=lambda l: sum(v.co.z for v in l) / len(l))
    P = [v.co.copy() for v in neck]
    N = [v.normal.copy() for v in neck]
    n = len(P)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    for _ in range(24):
        P = [(P[i - 1] + P[i] * 2 + P[(i + 1) % n]) / 4 for i in range(n)]
        N = [(N[i - 1] + N[i] * 2 + N[(i + 1) % n]).normalized() for i in range(n)]
    # even spacing round the neck so the collar's edge runs smooth
    arr = np.array([tuple(p) for p in P] + [tuple(P[0])])
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(arr, axis=0), axis=1))])
    m2 = 96
    tt = np.linspace(0, sl[-1], m2 + 1)[:-1]
    P = [Vector([np.interp(x, sl, arr[:, k]) for k in range(3)]) for x in tt]
    idx = [min(int(np.searchsorted(sl, x)), n - 1) for x in tt]
    N = [N[i] for i in idx]
    n = m2
    # start the ring at the centre front so the collar can open there
    i0 = min(range(n), key=lambda i: (P[i].y, abs(P[i].x)))
    P = P[i0:] + P[:i0]
    N = N[i0:] + N[:i0]
    if (P[1] - P[0]).x < 0:  # run toward +x first
        P = [P[0]] + P[1:][::-1]
        N = [N[0]] + N[1:][::-1]
    out = bmesh.new()
    rings = []
    gap = 0.012
    neck_front_z = P[0].z
    for i in range(n):
        t = (P[(i + 1) % n] - P[i - 1]).normalized()
        nm = N[i]
        if nm.dot(Vector((P[i].x, P[i].y, 0))) < 0:
            nm = -nm
        u = nm.cross(t).normalized()
        if u.z < 0:
            u = -u
        # how close to the centre front (0 at the back, 1 at the front opening)
        frontness = max(0.0, -P[i].y / max(1e-6, max(-q.y for q in P)))
        frontness = frontness ** 6
        fall = 0.042 + 0.045 * frontness      # the fall lengthens into the collar points
        spread = 0.006 + 0.016 * frontness
        stand = 0.026 * (1 - 0.3 * frontness)
        sec = [P[i] - u * 0.004,
               P[i] + u * stand,
               P[i] + u * (stand + 0.007) + nm * 0.009,
               P[i] + u * (stand - 0.004) + nm * 0.016,
               P[i] + u * (stand - fall * 0.5) + nm * (0.02 + spread * 0.3),
               P[i] + u * (stand - fall) + nm * (0.014 + spread * 0.25)]
        # the fall lies on the shirt: never inside it
        for k in range(3, len(sec)):
            hit = bvh.find_nearest(sec[k])
            if hit[0] is not None:
                nn = hit[1] if hit[1].dot(Vector((sec[k].x, sec[k].y, 0))) > 0 else -hit[1]
                d = (sec[k] - hit[0]).dot(nn)
                if d < 0.005:
                    sec[k] = sec[k] + nn * (0.005 - d)
        rings.append([out.verts.new(q) for q in sec])
    m = len(rings[0])
    # leave the centre front open between the collar points
    open_i = {i for i in range(n) if abs(P[i].x) < gap and P[i].y < 0}
    for i in range(n):
        j = (i + 1) % n
        if i in open_i and j in open_i:
            continue
        if (i in open_i) != (j in open_i) and min(abs(P[i].x), abs(P[j].x)) < gap:
            continue
        for k in range(m - 1):
            f = out.faces.new((rings[i][k], rings[j][k], rings[j][k + 1], rings[i][k + 1]))
            f.smooth = True
    loose = [v for v in out.verts if not v.link_faces]
    bmesh.ops.delete(out, geom=loose, context="VERTS")
    cme = bpy.data.meshes.new("collar")
    out.to_mesh(cme)
    out.free()
    collar = bpy.data.objects.new("collar", cme)
    bpy.context.collection.objects.link(collar)
    trim_neck = next(m for m in me.materials if m.name.startswith("Trim_Neck"))
    btn = next(m for m in me.materials if m.name.startswith("Button"))
    cme.materials.append(trim_neck)
    sol = collar.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.0025
    sol.offset = 0
    sub = collar.modifiers.new("s", "SUBSURF")
    sub.levels = 2
    apply_all(collar)
    # placket: a strip laid on the centre front, from the neckline down
    L, W = 0.13, 0.016
    out = bmesh.new()
    grid = []
    nu, nv = 4, 24
    for j in range(nv + 1):
        row = []
        z = neck_front_z - 0.004 - L * j / nv
        for i in range(nu + 1):
            x = -W + 2 * W * i / nu
            hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
            p = hit[0] if hit[0] is not None else Vector((x, -0.15, z))
            nrm = hit[1] if hit[1] is not None else Vector((0, -1, 0))
            if nrm.y > 0:
                nrm = -nrm
            row.append(out.verts.new(p + nrm * 0.0018))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            f = out.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
    pme = bpy.data.meshes.new("placket")
    out.to_mesh(pme)
    out.free()
    placket = bpy.data.objects.new("placket", pme)
    bpy.context.collection.objects.link(placket)
    pme.materials.append(trim_neck)
    sol = placket.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.002
    sol.offset = -1
    bev = placket.modifiers.new("b", "BEVEL")
    bev.width = 0.0012
    bev.segments = 2
    apply_all(placket)
    # buttons
    parts = [collar, placket]
    for dz in (0.035, 0.085):
        z = neck_front_z - dz
        hit = bvh.ray_cast(Vector((0, -1.0, z)), Vector((0, 1, 0)))
        p = hit[0] if hit[0] is not None else Vector((0, -0.15, z))
        b = bmesh.new()
        bmesh.ops.create_cone(b, cap_ends=True, segments=24, radius1=0.0058, radius2=0.0052, depth=0.0028)
        for k in range(4):  # the four thread holes
            a = k * math.pi / 2 + math.pi / 4
            bmesh.ops.create_cone(b, cap_ends=True, segments=8, radius1=0.0009, radius2=0.0009, depth=0.0032,
                                  matrix=Matrix.Translation((math.cos(a) * 0.0018, math.sin(a) * 0.0018, 0.0003)))
        b.transform(Matrix.Translation(p + Vector((0, -0.0045, 0))) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        bme = bpy.data.meshes.new("button")
        b.to_mesh(bme)
        b.free()
        bo = bpy.data.objects.new("button", bme)
        bpy.context.collection.objects.link(bo)
        bme.materials.append(btn)
        for poly in bme.polygons:
            poly.use_smooth = False
        parts.append(bo)
    return parts


def zip_details(ob):
    """
    A full-zip warm-up top: a knitted stand collar round the neck, open at the centre
    front, and a zip from the hem to the top of the collar with its slider and pull.
    """
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    loops = open_edges(bm)
    neck = max(loops, key=lambda l: sum(v.co.z for v in l) / len(l))
    P = [v.co.copy() for v in neck]
    N = [v.normal.copy() for v in neck]
    n = len(P)
    bvh = BVHTree.FromBMesh(bm)
    zmin = min(v.co.z for v in bm.verts)
    bm.free()
    for _ in range(24):
        P = [(P[i - 1] + P[i] * 2 + P[(i + 1) % n]) / 4 for i in range(n)]
        N = [(N[i - 1] + N[i] * 2 + N[(i + 1) % n]).normalized() for i in range(n)]
    arr = np.array([tuple(p) for p in P] + [tuple(P[0])])
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(arr, axis=0), axis=1))])
    m2 = 96
    tt = np.linspace(0, sl[-1], m2 + 1)[:-1]
    P = [Vector([np.interp(x, sl, arr[:, k]) for k in range(3)]) for x in tt]
    idx = [min(int(np.searchsorted(sl, x)), n - 1) for x in tt]
    N = [N[i] for i in idx]
    n = m2
    i0 = min(range(n), key=lambda i: (P[i].y, abs(P[i].x)))
    P = P[i0:] + P[:i0]
    N = N[i0:] + N[:i0]
    if (P[1] - P[0]).x < 0:
        P = [P[0]] + P[1:][::-1]
        N = [N[0]] + N[1:][::-1]
    neck_front_z = P[0].z
    trim_neck = next(m for m in me.materials if m.name.startswith("Trim_Neck"))
    metal = next(m for m in me.materials if m.name.startswith("Button"))
    # the stand collar: straight up, leaning in a little to hug the neck
    stand = 0.05
    gap = 0.0035
    out = bmesh.new()
    rings = []
    # (the shirt's normals turn sharply where the raglan seams meet the neck: the collar
    # is set from the neckline's own plan shape instead)
    cx = sum((p.x for p in P), 0.0) / n
    cy = sum((p.y for p in P), 0.0) / n
    for i in range(n):
        nm = Vector((P[i].x - cx, P[i].y - cy, 0)).normalized()
        up = Vector((0, 0, 1))
        sec = [P[i] - up * 0.006 + nm * 0.0015]
        for k in range(1, 7):
            f = k / 6
            sec.append(P[i] + up * stand * f - nm * 0.007 * f * f + nm * 0.0015 * (1 - f))
        rings.append([out.verts.new(q) for q in sec])
    m = len(rings[0])
    # where the collar's two front edges stand (the zip runs up between them)
    front_rings = rings[:3] + rings[-3:]
    col_front = [sum((r[k].co for r in front_rings), Vector()) / len(front_rings) for k in range(m)]
    for i in range(n):
        j = (i + 1) % n
        # the opening at the centre front: the zip runs up between the two halves
        if P[i].y < 0 and P[j].y < 0 and (P[i].x * P[j].x <= 0 or min(abs(P[i].x), abs(P[j].x)) < gap):
            continue
        for k in range(m - 1):
            f = out.faces.new((rings[i][k], rings[j][k], rings[j][k + 1], rings[i][k + 1]))
            f.smooth = True
    loose = [v for v in out.verts if not v.link_faces]
    bmesh.ops.delete(out, geom=loose, context="VERTS")
    cme = bpy.data.meshes.new("collar")
    out.to_mesh(cme)
    out.free()
    collar = bpy.data.objects.new("collar", cme)
    bpy.context.collection.objects.link(collar)
    cme.materials.append(trim_neck)
    sol = collar.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.003
    sol.offset = 0
    sub = collar.modifiers.new("s", "SUBSURF")
    sub.levels = 2
    apply_all(collar)
    # the zip: a chain of teeth down the centre front, laid on the shirt (and up the collar)
    path = []
    z = neck_front_z - 0.004
    step = 0.004
    while z > zmin + 0.004:
        hit = bvh.ray_cast(Vector((0, -1.0, z)), Vector((0, 1, 0)))
        if hit[0] is None:
            break
        nrm = hit[1] if hit[1].y < 0 else -hit[1]
        path.append((hit[0] + nrm * 0.0016, nrm))
        z -= step
    path = path[::-1]
    for k in range(m):
        q = col_front[k]
        path.append((Vector((0.0, q.y - 0.0025, q.z)), Vector((0, -1, 0))))
    out = bmesh.new()
    rows = []
    for c, nrm in path:
        side = Vector((1, 0, 0))
        rows.append([out.verts.new(c + side * x + nrm * h) for x, h in ((-0.0045, 0), (-0.0016, 0.001), (0.0016, 0.001), (0.0045, 0))])
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(3):
            f = out.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
            f.smooth = False
            f.material_index = 1 if i == 1 else 0
    zme = bpy.data.meshes.new("zip")
    out.to_mesh(zme)
    out.free()
    zipo = bpy.data.objects.new("zip", zme)
    bpy.context.collection.objects.link(zipo)
    zme.materials.append(trim_neck)   # the zip tape
    zme.materials.append(metal)       # the teeth
    sol = zipo.modifiers.new("t", "SOLIDIFY")
    sol.thickness = 0.0012
    sol.offset = -1
    apply_all(zipo)
    # slider and pull, parked just under the collar's top
    c_top = col_front[-2]
    c_top = Vector((0.0, c_top.y - 0.004, c_top.z - 0.006))
    b = bmesh.new()
    bmesh.ops.create_cube(b, size=1.0)
    b.transform(Matrix.Translation(c_top) @ Matrix.Diagonal((0.011, 0.005, 0.016, 1)))
    bmesh.ops.create_cube(b, size=1.0, matrix=Matrix.Translation(c_top + Vector((0, -0.003, -0.022))) @ Matrix.Diagonal((0.008, 0.0018, 0.03, 1)))
    pme = bpy.data.meshes.new("pull")
    b.to_mesh(pme)
    b.free()
    pull = bpy.data.objects.new("pull", pme)
    bpy.context.collection.objects.link(pull)
    pme.materials.append(metal)
    bev = pull.modifiers.new("b", "BEVEL")
    bev.width = 0.0012
    bev.segments = 2
    apply_all(pull)
    return [collar, zipo, pull]


def sleeve_print_coords(ob):
    """
    Sleeves carry no print coordinates of their own; give each sleeve point those of the
    nearest point on the armhole seam. Subdivision blends coordinates across the seam,
    and blending with an empty (0, 0, 0) would pull the chest print into the armhole.
    """
    from mathutils.kdtree import KDTree
    me = ob.data
    ra, rn = me.attributes["_rest"], me.attributes["_restn"]
    body = {i for i, m in enumerate(me.materials) if m.name.startswith(("Body", "Trim_Neck", "Trim_Hem"))}
    on_body = set()
    for p in me.polygons:
        if p.material_index in body:
            on_body.update(i for i in p.vertices if abs(ra.data[i].vector[2]) > 0.1)
    seam = [i for i in on_body if abs(ra.data[i].vector[2]) > 0.1]
    if not seam:
        return
    kd = KDTree(len(seam))
    for k, i in enumerate(seam):
        kd.insert(me.vertices[i].co, k)
    kd.balance()
    for v in me.vertices:
        if v.index in on_body or abs(ra.data[v.index].vector[2]) > 0.1:
            continue
        _, k, _ = kd.find(v.co)
        j = seam[k]
        ra.data[v.index].vector = ra.data[j].vector
        rn.data[v.index].vector = rn.data[j].vector


def band_round_uv(ob):
    """
    An elastic waistband's texture coordinates run round the waist (u = the angle round
    the body, v = height), so the web's gathers stand upright. The flat-pattern u slants
    once the leg is wrapped round the hips (the seat seams aren't vertical).
    """
    me = ob.data
    idx = {i for i, m in enumerate(me.materials) if m.name.split(".")[0] == "Waistband"}
    if not idx or not me.uv_layers:
        return
    uv = me.uv_layers.active.data
    for p in me.polygons:
        if p.material_index not in idx:
            continue
        us = []
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            us.append(math.atan2(co.x, -co.y) / (2 * math.pi) + 0.5)
        # a face straddling the back seam (u wraps 1 → 0) stays on one side
        if max(us) - min(us) > 0.5:
            us = [u + 1 if u < 0.5 else u for u in us]
        for li, u in zip(p.loop_indices, us):
            uv[li].uv = (u, me.vertices[me.loops[li].vertex_index].co.z)


def clear_of_form(ob, kind, clearance):
    """
    Keep the finished cloth off the display form the web shows it on. The smoothing and
    subdivision after the drape pull the cloth a hair inwards where it wraps round the
    form (the front of the crotch on the shorts), and the black form showed through.
    Every point closer than `clearance` is pushed out along the form's normal, and the
    push is eased into its neighbours so the cloth bulges smoothly instead of denting.
    """
    from mathutils.bvhtree import BVHTree
    fk.MATS.clear()
    fk.materials()
    col = bpy.context.collection
    form = lower_form(col) if kind == "hip" else fk.dress_form(col, arms=kind == "arms")
    parts = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("dress_form",) + LOWER_NAMES)]
    fbm = bmesh.new()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in parts:
        t = bmesh.new()
        t.from_object(o, dg)
        t.transform(o.matrix_world)
        tme = bpy.data.meshes.new("t")
        t.to_mesh(tme)
        t.free()
        fbm.from_mesh(tme)
        bpy.data.meshes.remove(tme)
    bmesh.ops.recalc_face_normals(fbm, faces=fbm.faces)  # each closed part: normals outward
    fbm.normal_update()
    bvh = BVHTree.FromBMesh(fbm)
    for o in parts:
        bpy.data.objects.remove(o)
    for n in [o.name for o in bpy.data.objects if o.name.startswith(("form_stand",) + LOWER_NAMES)]:
        bpy.data.objects.remove(bpy.data.objects[n])
    me = ob.data
    adj = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    moved = 0
    for _round in range(3):
        disp = {}
        for v in me.vertices:
            loc, nrm, _, d = bvh.find_nearest(v.co, 0.05)
            if loc is None:
                continue
            sd = (v.co - loc).dot(nrm)
            if sd < clearance:
                disp[v.index] = nrm * (clearance - sd)
        if not disp:
            break
        moved += len(disp)
        # ease the push out over two rings of neighbours
        field = dict(disp)
        for _ in range(2):
            grow = {}
            for i, dv in field.items():
                for n in adj[i]:
                    if n not in disp:
                        grow.setdefault(n, []).append(dv)
            for n, ds in grow.items():
                field[n] = sum(ds, Vector()) / len(ds) * 0.5 if n not in field else field[n]
        for i, dv in field.items():
            me.vertices[i].co += dv
    me.update()
    fbm.free()
    return moved


def _upper_envelope(P):
    """the upper convex hull of 2-D points, as (xs, ys) increasing in x"""
    P = sorted(map(tuple, P))
    hull = []
    for p in P:
        while len(hull) >= 2 and (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1]) - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0]) >= 0:
            hull.pop()
        hull.append(p)
    H = np.array(hull)
    return H[:, 0], H[:, 1]


def bridge_crotch(ob, half=0.13):
    DEEP = float(OPT.get("deep", 0.04))
    """
    Lay the cloth straight across the front and back of the crotch. On the form the
    cloth sank into the groove where the thighs meet the pelvis: the front showed two
    round lobes with a crease down the middle and the back seam was drawn in between the
    seat, like a nappy. Real fabric bridges those hollows, so each horizontal slice of
    the front (and back) is pushed out to its convex outline, fading out to the sides,
    from the crotch up to below the waistband.
    """
    me = ob.data
    V = np.array([v.co[:] for v in me.vertices])
    # the form's crotch (the inseams meet just below it; lower down the legs touch anyway)
    zc = Z_WAIST - 0.275 + float(OPT.get("zc", 0.0))
    z_lo, z_hi = zc + float(OPT.get("zlo", -0.005)), Z_WAIST - 0.07
    moved = 0
    newV = V.copy()
    step, win = 0.005, 0.012
    for side in (-1, 1):
        S = (np.sign(V[:, 1]) == side) & (np.abs(V[:, 0]) < half + 0.04) & (V[:, 2] > z_lo - win) & (V[:, 2] < z_hi + win)
        idx = np.nonzero(S)[0]
        if not len(idx):
            continue
        for z in np.arange(z_lo, z_hi + step, step):
            sl = idx[np.abs(V[idx, 2] - z) < win]
            if len(sl) < 6:
                continue
            # outward is -y at the front, +y at the back: the envelope of (x, outwardness)
            xs, ys = _upper_envelope(np.stack([V[sl, 0], V[sl, 1] * side], 1))
            tgt = idx[np.abs(V[idx, 2] - z) <= step / 2]
            for i in tgt:
                x = V[i, 0]
                if abs(x) > half:
                    continue
                env = float(np.interp(x, xs, ys))
                d = env - V[i, 1] * side          # how far the point lies inside the outline
                if d <= 0:
                    continue
                wx = 0.5 + 0.5 * math.cos(math.pi * min(abs(x) / half, 1.0))
                tz = min((V[i, 2] - z_lo) / 0.02, (z_hi - V[i, 2]) / 0.03, 1.0)
                w = wx * max(tz, 0.0) ** 2 * (3 - 2 * max(min(tz, 1.0), 0.0))
                # (much deeper than a hollow is the cloth turning under, between the legs: leave it)
                w *= min(max((DEEP - d) / 0.015, 0.0), 1.0)
                newV[i, 1] = V[i, 1] + side * d * w
                moved += 1
    for i, v in enumerate(me.vertices):
        v.co = newV[i]
    me.update()
    print(f"bridge_crotch: crotch at {zc:.3f}, {moved} points laid across", flush=True)


def finish(kit_id, ob, order, front, sleeved):
    shorts = KITS[kit_id].get("garment") in ("shorts", "pants")   # (bottoms)
    if shorts and not int(OPT.get("nobridge", 0)):
        bridge_crotch(ob)
    face_outward(ob, legs=shorts)
    soften_seams(ob, plain=KITS[kit_id]["neck"] in ("hood", "waist"))
    sm = ob.modifiers.new("settle", "CORRECTIVE_SMOOTH")
    sm.factor = 0.5
    sm.iterations = 6
    sm.smooth_type = "LENGTH_WEIGHTED"
    sm.rest_source = "ORCO"
    apply_all(ob)
    tidy_edges(ob)
    tidy_band_lines(ob)
    if not shorts:
        sleeve_print_coords(ob)
    # the rib bands lie smooth (a knitted rib doesn't take the body's small creases)
    me = ob.data
    tidx = {i for i, m in enumerate(me.materials) if m.name.startswith(("Trim_", "Waistband"))}
    tv = sorted({v for p in me.polygons if p.material_index in tidx for v in p.vertices})
    # plain averaging inside the bands only: the line a band is sewn on stays where
    # tidy_band_lines put it (smoothing across it left it ragged)
    sewn = {v for p in me.polygons if p.material_index not in tidx for v in p.vertices}
    relax(ob, [v for v in tv if v not in sewn], 0.45, 8, border=0.15)
    # soft, continuous fabric
    sub = ob.modifiers.new("soft", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    sub.boundary_smooth = "PRESERVE_CORNERS"
    apply_all(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    ng = stitch_grooves(ob)
    T = 0.0016   # fabric thickness, metres (thin knit; thicker pokes the lining through tight seam folds)
    # off the form the web shows it on (a long sleeve is shown on the form without arms)
    kind = "hip" if shorts else "arms" if KITS[kit_id]["sleeves"] == "short" else "none"
    pushed = clear_of_form(ob, kind, T + 0.003)
    print(f"{kit_id}: {pushed} points eased off the form", flush=True)
    roll = rolled_edges(ob, T, r=0.0032)
    neck = KITS[kit_id]["neck"]
    extras = polo_details(ob) if neck == "polo" else hoodie_details(ob) if neck == "hood" else zip_details(ob) if neck == "zip" else shorts_details(ob) if shorts else []
    # thickness + lining
    lining = bpy.data.materials.new("Lining")
    lining.use_nodes = True
    lining.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1)
    nmat = len(ob.data.materials)
    for _ in range(nmat):
        ob.data.materials.append(lining)
    sol = ob.modifiers.new("Thickness", "SOLIDIFY")
    sol.thickness = T
    sol.offset = -1
    sol.use_rim = True
    sol.material_offset = nmat
    sol.material_offset_rim = 0
    sol.use_quality_normals = True
    apply_all(ob)
    if neck == "hood":
        # the inside of the hood is the same fleece, seen from the back: not the dark lining
        for nm in ("Hood", "Trim_Neck"):
            i = mat_index(ob.data, nm)
            for p in ob.data.polygons:
                if p.material_index == i + nmat:
                    p.material_index = i
    objs = [ob, roll] + extras
    with bpy.context.temp_override(active_object=ob, object=ob, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    ob.name = "Jersey"
    # metres on the form → kit units (HPS at y = TOP), glTF-friendly
    # (shorts: the waist at y = TOP)
    zref = Z_WAIST if shorts else Z_HPS
    M = Matrix.Translation((0, 0, TOP)) @ Matrix.Scale(1 / S, 4) @ Matrix.Translation((0, 0, -zref))
    band_round_uv(ob)
    ob.data.transform(M)
    ob.data.update()
    m = front.meta
    if shorts:
        ob["W"] = float(m["hf"] / S)
        ob["top"] = float(TOP)
        ob["hem"] = float(TOP - m["V"] / S)
        ob["nw"] = -1.0
        ob["layout"] = "pants" if KITS[kit_id].get("garment") == "pants" else "shorts"
        ob["kind"] = "bottom"
        ob["sleeves"] = "none"
        ob["neck"] = "waist"
        ob["formBase"] = float(TOP - zref / S)
        ob["formScale"] = float(1 / S)
        return ng
    ob["W"] = float(m["cw"] / S)
    ob["top"] = float(TOP)
    ob["hem"] = float(m["hem"] / S + TOP)
    ob["nw"] = float(m["nw"] / S)
    ob["sleeves"] = KITS[kit_id]["sleeves"]
    ob["neck"] = KITS[kit_id]["neck"]
    ob["frontDepth"] = 0.36
    if neck == "hood":
        ob["layout"] = "hoodie"  # the back print sits below the hood
    ob["formBase"] = float(TOP - Z_HPS / S)
    ob["formScale"] = float(1 / S)
    return ng


def export(kit_id, ob):
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{kit_id}.blend"))
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"{kit_id}.glb"), export_format="GLB", use_selection=True, export_apply=True,
        export_extras=True, export_yup=True, export_normals=True, export_texcoords=True,
        export_materials="EXPORT", export_attributes=True,
    )
    me = ob.data
    print(f"{kit_id}: {len(me.vertices)} verts, {sum(len(p.vertices) - 2 for p in me.polygons)} tris", flush=True)


# ---------------------------------------------------------------- shorts
def shorts_piece(spec):
    """
    One leg of a pair of shorts, cut in one piece round the leg (no side seam): the
    side line is u = 0, the front runs to u < 0 (centre front seam, front crotch,
    inseam), the back to u > 0. v is the height above the leg hem.
    """
    vc = spec.get("vc", 0.17)        # inseam: crotch above the hem
    V = spec["L"]                    # centre-front waist above the hem
    wf, wb = 0.18, 0.19              # half the waist each side of the side line: an elastic
    #                                  waistband is cut smaller than the waist (0.79 m) it grips
    hf, hb = spec["cw"], spec["cw"] + 0.02    # at the hip
    ef, eb = float(OPT.get("ef", spec.get("ef", 0.055))), float(OPT.get("eb", spec.get("eb", 0.09)))   # crotch extensions
    lf, lb = float(OPT.get("lf", spec.get("lf", 0.34))), float(OPT.get("lb", spec.get("lb", 0.38)))   # leg opening: wide, straight legs
    nin = count(vc + 0.01)
    p = Piece("leg", "Body")
    # the hem rises toward the side seam line (a running short's curved hem): on the form the
    # thigh splays out, and a straight hem rode up into a V at the crotch
    rise = float(OPT.get("rise", spec.get("rise", 0.015)))
    hu = np.linspace(-lf, lb, 400)
    hv = rise * (1 - np.where(hu < 0, hu / lf, hu / lb) ** 2) ** 1.5
    p.add("hem", even(np.stack([hu, hv], 1), count(lf + lb, 0.01)))
    knee = spec.get("knee")
    if knee:
        # inseam: hem → knee straight, then curving out to the crotch point
        kv, kf, kb = knee
        def inseam(l, k, c):
            P = np.concatenate([seg((l, 0), (k, kv), 60)[:-1],
                                bez((k, kv), (k + (c - k) * 0.25, kv + (vc - kv) * 0.55), (c - 0.012, vc - 0.05), (c, vc), 120)])
            return even(P, nin)
        p.add("inB", inseam(lb, kb, hb + eb))
    else:
        p.add("inB", seg((lb, 0), (hb + eb, vc), nin))
    cb = np.concatenate([bez((hb + eb, vc), (hb + eb * 0.35, vc + 0.004), (hb, vc + 0.05), (hb, vc + 0.12), 100)[:-1],
                         seg((hb, vc + 0.12), (wb, V + 0.025), 60)])
    p.add("cb", even(cb, count(length(cb))))
    p.add("waist", bez((wb, V + 0.025), (wb * 0.4, V + 0.03), (-wf * 0.4, V + 0.004), (-wf, V), count(wf + wb, 0.01)))
    cf = np.concatenate([seg((-wf, V), (-hf, vc + 0.1), 60)[:-1],
                         bez((-hf, vc + 0.1), (-hf, vc + 0.04), (-hf - ef * 0.6, vc + 0.004), (-(hf + ef), vc), 100)])
    p.add("cf", even(cf, count(length(cf))))
    if knee:
        p.add("inF", (inseam(lf, kf, hf + ef) * [-1, 1])[::-1])
    else:
        p.add("inF", seg((-(hf + ef), vc), (-lf, 0), nin))
    p.meta = dict(vc=vc, V=V, hf=hf, hb=hb)
    # the front and back edges of the piece as functions of the height
    def edge_fn(tags, sign):
        P = np.concatenate([dict(p.edges)[t] for t in tags])
        P = P[np.argsort(P[:, 1])]
        return lambda v: np.interp(v, P[:, 1], P[:, 0])
    p.uF = edge_fn(("cf", "inF"), -1)
    p.uB = edge_fn(("cb", "inB"), 1)
    return p


def place_leg(V2, piece, sx):
    """the leg piece round the hip form: half the pelvis above the crotch, a tube round the thigh below"""
    global LEG_D, LEG_X, LEG_RX, LEG_RY
    sec = fk.leg_sections(long=LOWER["kind"] == "pants")
    LEG_D, LEG_X, LEG_RX, LEG_RY = (np.array(c) for c in zip(*sec))
    vc = piece.meta["vc"]
    zc = Z_WAIST - 0.275            # the form's crotch
    out = []
    for u, v in V2:
        uF, uB = float(piece.uF(v)), float(piece.uB(v))
        z = zc + (v - vc)
        # pelvis: centre front (-π/2) → side (0) → centre back (π/2)
        th = (-0.5 * math.pi * (u / uF)) if u < 0 else (0.5 * math.pi * (u / uB))
        # just outside the form's section at this height (the waistband is pinned here)
        h = Z_WAIST - z
        # (the form's sections are superellipses: an ellipse would cut into it at the corners)
        a = float(np.interp(h, [0, 0.07, 0.15, 0.21, 0.25, 0.3], [0.142, 0.16, 0.176, 0.177, 0.168, 0.15])) + 0.009
        b = float(np.interp(h, [0, 0.07, 0.15, 0.21, 0.25, 0.3], [0.1, 0.112, 0.128, 0.128, 0.12, 0.1])) + 0.009
        e = 2.4
        c_, s_ = math.cos(th), math.sin(th)
        P1 = Vector((sx * a * abs(c_) ** (2 / e), b * math.copysign(abs(s_) ** (2 / e), s_), z))
        # leg tube round the form's leg, at the cloth's own size where it can be: the cloth's
        # rest shape is the shape it's placed in, so a tube placed wider than its pattern stays
        # that wide (track pants hung as straight 19 cm tubes from thigh to ankle); just clear
        # of the leg where the pattern is closer-fitting than that
        ph = (-math.pi * (u / uF)) if u < 0 else (math.pi * (u / uB))
        depth = Z_WAIST - z
        cx, rx, ry = (float(np.interp(depth, LEG_D, c)) for c in (LEG_X, LEG_RX, LEG_RY))
        R = max((uB - uF) / (2 * math.pi), max(rx, ry) + 0.008)
        P2 = Vector((sx * (cx + R * math.cos(ph)), 0.006 + R * math.sin(ph), z))
        w = min(max((v - (vc - 0.03)) / 0.12, 0.0), 1.0)
        w = w * w * (3 - 2 * w)
        out.append(tuple(P2.lerp(P1, w)))
    return np.array(out)


def build_shorts(kit_id, spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fk.MATS.clear()
    order = ["Body", "Sleeve", "Trim_Neck", "Trim_Arm", "Trim_Hem", "Button", "Hood", "Waistband", "Cord"]
    mats = {}
    for name in order:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.85, 0.84, 0.8, 1) if name == "Button" else (0.5, 0.5, 0.5, 1)
        b.inputs["Roughness"].default_value = 0.85
        mats[name] = m
    piece = shorts_piece(spec)
    bands = {"Waistband": band(piece, {"waist"}, 0.042), "Trim_Hem": band(piece, {"hem"}, spec.get("cuff", 0.022))}
    V2, T, n_out, owner, tattr = triangulate(piece, bands)
    # the form, to start every point of the cloth clear of it
    from mathutils.bvhtree import BVHTree
    fk.materials()
    form = lower_form(bpy.context.collection)
    fbm = bmesh.new()
    fbm.from_mesh(form.data)
    fbm.normal_update()
    fbvh = BVHTree.FromBMesh(fbm)

    def clear(p):
        p = Vector(p)
        loc, nrm, _, d = fbvh.find_nearest(p)
        if loc is not None:
            # push out along the surface normal by the depth, so neighbours never land on one spot
            depth = -(p - loc).dot(nrm)
            if depth > -0.012:
                p = p + nrm * (depth + 0.012)
        return tuple(p)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rest = {}
    legs = {}
    edge_verts = {}
    W = spec["cw"]
    V = piece.meta["V"]
    for sx in (1, -1):
        P3 = place_leg(V2, piece, sx)
        verts = [bm.verts.new(clear(p)) for p in P3]
        legs[sx] = verts
        k_of = {}
        for i, (k, j) in enumerate(owner):
            k_of.setdefault(k, []).append(i)
        for k, (tag, _) in enumerate(piece.edges):
            ids = k_of[k] + [k_of[(k + 1) % len(piece.edges)][0]]
            edge_verts[(sx, tag)] = [verts[i] for i in ids]
        for i, v in enumerate(verts):
            u, h = V2[i]
            ue = float(piece.uF(h)) if u < 0 else float(piece.uB(h))
            x = sx * W * (1 - min(abs(u) / max(abs(ue), 1e-6), 1.0))
            front = u <= 0
            rest[v] = ((x / S, (h - V) / S + TOP, 0.3 if front else -0.3), (0, 0, 1 if front else -1))
        for ti, (a, b, c) in enumerate(T):
            tri = (verts[a], verts[b], verts[c])
            f = bm.faces.new(tri if sx > 0 else tri[::-1])
            name = REGION_NAME.get(int(tattr[ti]), "Body")
            f.material_index = order.index(name)
            f.smooth = True
            for lp, idx in zip(f.loops, (a, b, c) if sx > 0 else (c, b, a)):
                uu, ww = V2[idx]
                lp[uv_layer].uv = (uu + 0.5, ww)

    def sew(A, B):
        assert len(A) == len(B), (len(A), len(B))
        for va, vb in zip(A, B):
            if va is not vb and not bm.edges.get((va, vb)):
                bm.edges.new((va, vb))
    sew(edge_verts[(1, "cf")], edge_verts[(-1, "cf")])
    sew(edge_verts[(1, "cb")], edge_verts[(-1, "cb")])
    for sx in (1, -1):
        sew(edge_verts[(sx, "inF")], edge_verts[(sx, "inB")][::-1])
    fbm.free()
    for n in [o.name for o in bpy.data.objects if o.name.startswith(LOWER_NAMES)]:
        bpy.data.objects.remove(bpy.data.objects[n])
    me = bpy.data.meshes.new(f"{kit_id}_mesh")
    bm.verts.index_update()
    twin_idx = {}
    for vr, vl in zip(legs[1], legs[-1]):
        twin_idx[vr.index] = vl.index
        twin_idx[vl.index] = vr.index
    rest_co = [rest[v] for v in bm.verts]
    bm.to_mesh(me)
    bm.free()
    for nm in order:
        me.materials.append(mats[nm])
    ra = me.attributes.new("_rest", "FLOAT_VECTOR", "POINT")
    rn = me.attributes.new("_restn", "FLOAT_VECTOR", "POINT")
    for i, (co, nn) in enumerate(rest_co):
        ra.data[i].vector = co
        rn.data[i].vector = nn
    tw = me.attributes.new("twin", "INT", "POINT")
    for i, t in twin_idx.items():
        tw.data[i].value = t
    ob = bpy.data.objects.new("Jersey", me)
    bpy.context.collection.objects.link(ob)
    return ob, piece


def shorts_details(ob):
    """the drawcord tied at the front of the waistband"""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    wb = mat_index(me, "Waistband")
    zs = [v.co.z for f in bm.faces if f.material_index == wb for v in f.verts if v.co.y < 0 and abs(v.co.x) < 0.03]
    zmid = (min(zs) + max(zs)) / 2
    out = bmesh.new()
    for sx in (1, -1):
        hit = bvh.ray_cast(Vector((sx * 0.014, -1.0, zmid)), Vector((0, 1, 0)))
        c = hit[0]
        nm = hit[1] if hit[1].y < 0 else -hit[1]
        eyelet_cord(out, bvh, c + nm * 0.0012, nm, 0.13, sx * 0.012, swing=sx * 0.02)
    bm.free()
    cme = bpy.data.meshes.new("cords")
    out.to_mesh(cme)
    out.free()
    cords = bpy.data.objects.new("cords", cme)
    bpy.context.collection.objects.link(cords)
    cme.materials.append(me.materials[mat_index(me, "Cord")])
    cme.materials.append(me.materials[mat_index(me, "Button")])
    return [cords]


def make_shorts(kit_id):
    spec = KITS[kit_id]
    pants = spec.get("garment") == "pants"
    LOWER["kind"] = "pants" if pants else "hip"
    if "drape" in OPT:
        # --opt=drape:path/kit_pre.blend (saved with --pre): finish a saved drape
        bpy.ops.wm.open_mainfile(filepath=OPT["drape"])
        ob = bpy.data.objects["Jersey"]
        finish(kit_id, ob, None, shorts_piece(spec), False)
        export(kit_id, ob)
        return
    FABRIC.update(bend=float(OPT.get("bend", 6.0 if spec.get("garment") == "pants" else 4.0)))  # a woven polyester holds its line better than a jersey knit
    ob, piece = build_shorts(kit_id, spec)
    # (track pants: the rib cuffs are knitted smaller than the leg: they gather it round the ankle)
    simulate(ob, False, frames=160 if pants else 120, shorts=True, rib_shrink=float(OPT.get("shrink", 0.0)) if pants else 0.0)
    symmetrize(ob)
    gap = weld(ob)
    centre = ob.data.attributes.get("centre")
    keep = [d.value for d in centre.data] if centre else None
    if centre:
        ob.data.attributes.remove(centre)
    simulate(ob, False, frames=24, settle_only=True, shorts=True)
    if keep:
        c2 = ob.data.attributes.new("centre", "INT", "POINT")
        for i, v in enumerate(keep):
            c2.data[i].value = v
    if "--pre" in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{kit_id}_pre.blend"))
    ng = finish(kit_id, ob, None, piece, False)
    print(f"{kit_id}: seam gap {gap:.4f} m, {ng} stitch verts", flush=True)
    export(kit_id, ob)



def make(kit_id):
    spec = KITS[kit_id]
    if spec.get("garment") in ("shorts", "pants"):
        return make_shorts(kit_id)
    long = spec["sleeves"] == "long"
    if "drape" in OPT:
        # --opt=drape:path/kit_drape.blend: skip the simulation, finish a saved drape
        # (for working on the finishing details)
        bpy.ops.wm.open_mainfile(filepath=OPT["drape"])
        ob = bpy.data.objects["Jersey"]
        ng = finish(kit_id, ob, None, body_piece(spec, "front"), spec["sleeves"] != "none")
        export(kit_id, ob)
        return
    if long:
        # draped as before (arms held out along the sleeve); the sleeves are brought down after
        FABRIC.update(hood_bend=float(OPT.get("hood_bend", 1.0)))
    ob, mats, order, front, back, sleeved, widths = build(kit_id, spec)
    simulate(ob, sleeved, frames=160 if long else 120)
    symmetrize(ob)
    gap = weld(ob)
    # a short settle of the closed, symmetric garment: lets the averaged centre line
    # relax physically instead of keeping a crease
    centre = ob.data.attributes.get("centre")
    keep = [d.value for d in centre.data] if centre else None
    if centre:
        ob.data.attributes.remove(centre)
    simulate(ob, sleeved, frames=24, settle_only=True)
    if long:
        # held out at 56° the long sleeves stood out stiffly, like a scarecrow: bring them
        # down nearer the sides (all the way down, they'd cut into the body's sides)
        down = float(OPT.get("down", 38))
        lower_sleeves(ob, ARM["angle"], down)
        ARM.update(angle=down)
        if int(OPT.get("settle", 0)):
            simulate(ob, sleeved, frames=int(OPT["settle"]), settle_only=True)
    if spec["neck"] == "hood":
        if "--pre" in ARGS:
            bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{kit_id}_pre.blend"))
        hood_stage(ob)
    if keep:
        c2 = ob.data.attributes.new("centre", "INT", "POINT")
        for i, v in enumerate(keep):
            c2.data[i].value = v
    if "--save-drape" in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{kit_id}_drape.blend"))
    ng = finish(kit_id, ob, order, front, sleeved)
    print(f"{kit_id}: seam gap {gap:.4f} m, {ng} stitch verts", flush=True)
    export(kit_id, ob)


if __name__ == "__main__":
    for kit_id in KITS:
        if ONLY and kit_id not in ONLY:
            continue
        make(kit_id)
