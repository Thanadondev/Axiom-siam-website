"""
Axiom factory kit — the props for the 3D factory on the landing page.

Every prop is one object with a handful of shared materials, built at the
origin standing on the floor, front facing -Y (which is +Z in glTF, toward the
web camera). The web instances each prop many times, so polygon counts stay
modest; detail comes from bevels, real parts and good materials.

Material names matter to the web:
  Fabric  — tinted per instance (shirts, rolls, work on the benches)
  Glow    — emissive, picked up by bloom
  Screen  — emissive panel screens

Run:  blender -b -P factory_kit.py -- <out_dir> [--render]
      or inside Blender's text editor / MCP (builds into the open scene).
"""
import bpy, bmesh, math, sys, random
from math import pi, sin, cos, radians
from mathutils import Vector, Matrix

random.seed(7)
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGV[0] if ARGV and not ARGV[0].startswith("--") else None
RENDER = "--render" in ARGV

# ------------------------------------------------------------------ materials
MATS = {}


def mat(name, color, metal=0.0, rough=0.5, emit=None, strength=0.0, clearcoat=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if clearcoat and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = clearcoat
    if emit:
        key = "Emission Color" if "Emission Color" in b.inputs else "Emission"
        b.inputs[key].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*color, 1)
    MATS[name] = m
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def materials():
    mat("Steel", srgb("#3a3d42"), metal=0.75, rough=0.42)
    mat("SteelDark", srgb("#1f2125"), metal=0.6, rough=0.5)
    mat("Chrome", srgb("#d7d9dc"), metal=1.0, rough=0.16)
    mat("Alu", srgb("#b9bcc0"), metal=0.9, rough=0.32)
    mat("Cream", srgb("#e9e4d8"), rough=0.32, clearcoat=0.4)
    mat("Black", srgb("#141518"), rough=0.45)
    mat("Rubber", srgb("#0d0d0e"), rough=0.85)
    mat("Laminate", srgb("#c9c4b8"), rough=0.55)
    mat("RackBlue", srgb("#1f4fa8"), metal=0.3, rough=0.45)
    mat("RackOrange", srgb("#f26522"), metal=0.3, rough=0.45)
    mat("Yellow", srgb("#e0b21a"), rough=0.5)
    mat("Cardboard", srgb("#a77b4f"), rough=0.85)
    mat("Tape", srgb("#c8a26f"), rough=0.35)
    mat("Wood", srgb("#8a6a45"), rough=0.8)
    mat("Felt", srgb("#3b3e44"), rough=0.95)
    mat("Fabric", srgb("#f2f0eb"), rough=0.88)
    mat("Glow", srgb("#fff3e2"), emit=srgb("#fff1dc"), strength=12.0)
    mat("Screen", srgb("#0b2230"), emit=srgb("#36c2ff"), strength=2.5)
    mat("Thread", srgb("#f26522"), rough=0.6)
    mat("FormGloss", srgb("#0c0c0e"), metal=0.0, rough=0.18, clearcoat=1.0)


# ------------------------------------------------------------------ mesh helpers
class Part:
    """collects geometry for one prop into a single bmesh with material slots"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def _slot(self, m):
        m = MATS[m] if isinstance(m, str) else m
        if m not in self.slots:
            self.slots.append(m)
        return self.slots.index(m)

    def _add(self, bm2, m, matrix):
        bm2.transform(matrix)
        idx = self._slot(m)
        me = bpy.data.meshes.new("tmp")
        bm2.to_mesh(me)
        bm2.free()
        for p in me.polygons:
            p.material_index = idx
        off = len(self.bm.verts)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        # from_mesh resets material indices of new faces? keep by re-reading
        return off

    def box(self, size, loc=(0, 0, 0), m="Steel", bevel=0.0, seg=2, rot=(0, 0, 0)):
        b = bmesh.new()
        bmesh.ops.create_cube(b, size=1.0)
        bmesh.ops.scale(b, vec=Vector(size), verts=b.verts)
        if bevel > 0:
            bmesh.ops.bevel(b, geom=list(b.edges), offset=min(bevel, min(size) * 0.45), segments=seg, affect="EDGES", profile=0.5)
        self._add(b, m, Matrix.Translation(loc) @ euler(rot))

    def cyl(self, r, h, loc=(0, 0, 0), m="Steel", rot=(0, 0, 0), n=20, r2=None, cap=True, bevel=0.0):
        b = bmesh.new()
        bmesh.ops.create_cone(b, cap_ends=cap, cap_tris=False, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h)
        if bevel > 0 and cap:
            rim = [e for e in b.edges if len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
            bmesh.ops.bevel(b, geom=rim, offset=bevel, segments=2, affect="EDGES", profile=0.5)
        self._add(b, m, Matrix.Translation(loc) @ euler(rot))

    def torus(self, R, r, loc=(0, 0, 0), m="Chrome", rot=(0, 0, 0), n=24, n2=8, arc=2 * pi):
        b = bmesh.new()
        verts = []
        steps = n if arc < 2 * pi - 1e-3 else n
        rings = []
        for i in range(steps + (1 if arc < 2 * pi - 1e-3 else 0)):
            a = arc * i / steps
            ring = []
            for j in range(n2):
                t = 2 * pi * j / n2
                p = Vector(((R + r * cos(t)) * cos(a), (R + r * cos(t)) * sin(a), r * sin(t)))
                ring.append(b.verts.new(p))
            rings.append(ring)
        closed = arc >= 2 * pi - 1e-3
        for i in range(len(rings) - (0 if closed else 1)):
            r1, r2_ = rings[i], rings[(i + 1) % len(rings)]
            for j in range(n2):
                b.faces.new((r1[j], r1[(j + 1) % n2], r2_[(j + 1) % n2], r2_[j]))
        self._add(b, m, Matrix.Translation(loc) @ euler(rot))

    def tube(self, a, b_, r, m="Steel", n=10):
        """a straight round tube between two points"""
        a, b_ = Vector(a), Vector(b_)
        d = b_ - a
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        b = bmesh.new()
        bmesh.ops.create_cone(b, cap_ends=True, segments=n, radius1=r, radius2=r, depth=d.length)
        self._add(b, m, Matrix.Translation((a + b_) / 2) @ rot)

    def prism(self, pts2d, depth, loc=(0, 0, 0), m="Fabric", rot=(0, 0, 0), bulge=0.0):
        """extrude a 2D outline (x, z) along y; optional bulge pushes the middle out"""
        b = bmesh.new()
        front = [b.verts.new((x, -depth / 2, z)) for x, z in pts2d]
        back = [b.verts.new((x, depth / 2, z)) for x, z in pts2d]
        b.faces.new(front[::-1])
        b.faces.new(back)
        n = len(pts2d)
        for i in range(n):
            b.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]))
        bmesh.ops.triangulate(b, faces=[f for f in b.faces if len(f.verts) > 4])
        if bulge:
            cx = sum(p[0] for p in pts2d) / n
            cz = sum(p[1] for p in pts2d) / n
            span = max(abs(p[0] - cx) for p in pts2d)
            # subdivide the caps a little so the bulge has somewhere to go
            bmesh.ops.subdivide_edges(b, edges=list(b.edges), cuts=2, use_grid_fill=True)
            for v in b.verts:
                k = max(0.0, 1 - ((v.co.x - cx) ** 2 + ((v.co.z - cz) * 0.8) ** 2) / (span ** 2))
                v.co.y += math.copysign(bulge * k, v.co.y)
        self._add(b, m, Matrix.Translation(loc) @ euler(rot))

    def build(self, collection):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        # shade smooth by angle for rounded parts
        try:
            me.set_sharp_from_angle(angle=radians(40))
            for p in me.polygons:
                p.use_smooth = True
        except AttributeError:
            pass
        return ob


def euler(r):
    return Matrix.Rotation(r[2], 4, "Z") @ Matrix.Rotation(r[1], 4, "Y") @ Matrix.Rotation(r[0], 4, "X")


# Part._add keeps per-face material by writing material_index before merging;
# bmesh.from_mesh preserves it, so no extra bookkeeping is needed.


# ------------------------------------------------------------------ props
def sewing_station(col):
    """industrial lockstitch on its table, with stool, pedal and thread stand. Bench top at 0.78 m."""
    p = Part("sewing_station")
    T = 0.78
    # table: laminate top with the machine well, steel frame, drawer
    p.box((1.2, 0.6, 0.032), (0, 0, T - 0.016), "Laminate", bevel=0.006)
    p.box((1.2, 0.012, 0.035), (0, -0.3, T - 0.018), "Black")  # edge band front
    for x in (-0.54, 0.54):
        p.tube((x, -0.24, 0), (x, -0.24, T - 0.032), 0.018)
        p.tube((x, 0.24, 0), (x, 0.24, T - 0.032), 0.018)
        p.tube((x, -0.24, 0.12), (x, 0.24, 0.12), 0.012)
        p.box((0.08, 0.56, 0.02), (x, 0, 0.01), "SteelDark")
    p.tube((-0.54, 0.24, 0.12), (0.54, 0.24, 0.12), 0.012)
    p.box((0.34, 0.42, 0.11), (-0.36, 0.0, T - 0.09), "Black", bevel=0.008)  # drawer
    p.box((0.1, 0.01, 0.02), (-0.36, -0.215, T - 0.09), "Chrome", bevel=0.004)
    # servo motor + control box under the top
    p.box((0.2, 0.16, 0.14), (0.22, 0.05, T - 0.12), "Black", bevel=0.012)
    p.cyl(0.06, 0.05, (0.22, -0.05, T - 0.12), "SteelDark", rot=(pi / 2, 0, 0), n=16)
    # pedal and knee lift
    p.box((0.22, 0.3, 0.03), (0.15, -0.12, 0.05), "Black", bevel=0.01, rot=(radians(-12), 0, 0))
    p.tube((0.15, -0.05, 0.08), (0.18, 0.05, T - 0.2), 0.006, "Chrome")
    p.box((0.05, 0.05, 0.12), (-0.05, -0.28, T - 0.12), "Black", bevel=0.01)

    # the machine — bed, pillar, arm, head, handwheel (cream body, Juki-style)
    bx, by = 0.02, 0.02
    p.box((0.5, 0.19, 0.055), (bx, by, T + 0.028), "Cream", bevel=0.018, seg=3)
    p.box((0.12, 0.15, 0.25), (bx + 0.17, by + 0.01, T + 0.18), "Cream", bevel=0.03, seg=3)
    p.box((0.44, 0.12, 0.1), (bx + 0.0, by + 0.01, T + 0.3), "Cream", bevel=0.035, seg=3)
    p.box((0.1, 0.13, 0.17), (bx - 0.19, by + 0.01, T + 0.25), "Cream", bevel=0.03, seg=3)
    p.box((0.102, 0.08, 0.06), (bx - 0.19, by - 0.03, T + 0.31), "Black", bevel=0.01)  # face plate
    p.cyl(0.006, 0.12, (bx - 0.2, by - 0.02, T + 0.13), "Chrome", n=8)  # needle bar
    p.box((0.03, 0.04, 0.008), (bx - 0.2, by - 0.025, T + 0.062), "Chrome")  # presser foot
    p.box((0.16, 0.12, 0.006), (bx - 0.12, by, T + 0.058), "Chrome")  # needle plate
    p.cyl(0.075, 0.035, (bx + 0.26, by + 0.01, T + 0.3), "Black", rot=(0, pi / 2, 0), n=24, bevel=0.006)
    p.cyl(0.03, 0.05, (bx + 0.29, by + 0.01, T + 0.3), "SteelDark", rot=(0, pi / 2, 0), n=12)
    p.box((0.05, 0.002, 0.03), (bx + 0.05, by - 0.051, T + 0.31), "Thread")  # brand badge
    p.box((0.06, 0.03, 0.012), (bx - 0.12, by - 0.03, T + 0.245), "Glow", bevel=0.004)  # LED under the arm
    # thread stand with two cones
    p.tube((0.42, 0.22, T), (0.42, 0.22, T + 0.62), 0.006, "Chrome")
    p.tube((0.36, 0.22, T + 0.62), (0.5, 0.22, T + 0.62), 0.005, "Chrome")
    for i, x in enumerate((0.38, 0.47)):
        p.cyl(0.035, 0.12, (x, 0.22, T + 0.07), "Thread" if i == 0 else "Fabric", r2=0.022, n=16)
        p.cyl(0.026, 0.012, (x, 0.22, T + 0.006), "Black", n=16)
    # stool
    p.cyl(0.18, 0.045, (0.0, -0.62, 0.5), "Black", n=24, bevel=0.015)
    for a in range(4):
        ang = a * pi / 2 + pi / 4
        p.tube((cos(ang) * 0.06, -0.62 + sin(ang) * 0.06, 0.48), (cos(ang) * 0.2, -0.62 + sin(ang) * 0.2, 0.0), 0.013)
    p.torus(0.13, 0.008, (0, -0.62, 0.2), "Steel", n=20, n2=6)
    return p.build(col)


def work_cloth(col):
    """the job under the needle: cut panels draped over the bed (tinted per bench)"""
    p = Part("work_cloth")
    T = 0.78
    p.box((0.46, 0.36, 0.006), (-0.32, -0.06, T + 0.003), "Fabric", rot=(0, 0, radians(6)))
    p.box((0.4, 0.3, 0.006), (-0.3, -0.04, T + 0.009), "Fabric", rot=(0, 0, radians(-9)))
    p.box((0.26, 0.2, 0.05), (-0.42, 0.18, T + 0.025), "Fabric", bevel=0.02)  # folded stack
    return p.build(col)


def highbay(col):
    """UFO high-bay LED: finned housing, reflector, glowing disc. Origin at the disc."""
    p = Part("highbay")
    p.cyl(0.19, 0.09, (0, 0, 0.16), "SteelDark", n=32, bevel=0.01)
    for i in range(24):
        a = i * 2 * pi / 24
        p.box((0.11, 0.008, 0.07), (cos(a) * 0.23, sin(a) * 0.23, 0.16), "SteelDark", rot=(0, 0, a))
    p.cyl(0.24, 0.02, (0, 0, 0.11), "Steel", n=32)
    p.cyl(0.42, 0.24, (0, 0, 0.0), "Alu", r2=0.24, cap=False, n=32)  # reflector (open)
    p.cyl(0.245, 0.012, (0, 0, -0.002), "Glow", n=32)
    p.torus(0.42, 0.008, (0, 0, -0.12), "Alu", n=32, n2=6)
    p.torus(0.04, 0.008, (0, 0, 0.24), "Chrome", n=12, n2=6, rot=(pi / 2, 0, 0))
    return p.build(col)


def roll_rack(col):
    """pallet racking, blue uprights and orange beams, 4 levels. 2.7 wide, 1.1 deep."""
    p = Part("roll_rack")
    H, W, D = 3.6, 2.7, 1.1
    for x in (-W / 2, W / 2):
        for y in (-D / 2, D / 2):
            p.box((0.08, 0.07, H), (x, y, H / 2), "RackBlue", bevel=0.006)
            p.box((0.16, 0.14, 0.012), (x, y, 0.006), "SteelDark")
        # bracing between uprights
        for k in range(5):
            z0, z1 = 0.2 + k * 0.68, 0.2 + (k + 1) * 0.68
            p.tube((x, -D / 2, z0), (x, D / 2, min(z1, H - 0.1)), 0.014, "RackBlue", n=8)
            p.tube((x, -D / 2, z0), (x, D / 2, z0), 0.014, "RackBlue", n=8)
        # hole pattern hint: a strip of dark slots on the front uprights
        for k in range(26):
            p.box((0.02, 0.004, 0.035), (x, -D / 2 - 0.036, 0.25 + k * 0.13), "SteelDark")
    for lv in range(4):
        z = 0.14 + lv * 0.95
        for y in (-D / 2, D / 2):
            p.box((W, 0.05, 0.11), (0, y, z), "RackOrange", bevel=0.008)
        for x in (-0.9, 0, 0.9):
            p.box((0.05, D, 0.03), (x, 0, z + 0.04), "Steel")  # cradle bars
    p.box((0.32, 0.005, 0.1), (0, -D / 2 - 0.03, 0.14 + 3 * 0.95), "Yellow")  # load sign
    return p.build(col)


def fabric_roll(col):
    """a roll of knit lying along X: 1.6 m wide, cardboard core showing at the ends"""
    p = Part("fabric_roll")
    p.cyl(0.17, 1.6, (0, 0, 0), "Fabric", rot=(0, pi / 2, 0), n=28, bevel=0.012)
    p.cyl(0.045, 1.66, (0, 0, 0), "Cardboard", rot=(0, pi / 2, 0), n=16)
    p.cyl(0.03, 1.665, (0, 0, 0), "Black", rot=(0, pi / 2, 0), n=12)
    p.box((0.05, 0.002, 0.08), (0.55, -0.171, 0.0), "Laminate")  # label
    return p.build(col)


def tee_outline(w=0.56, h=0.74):
    """half-sleeve tee, as (x, z) points; collar at the top centre"""
    s = w / 0.56
    pts = [(-0.08, 0.37), (-0.04, 0.345), (0.0, 0.338), (0.04, 0.345), (0.08, 0.37),
           (0.2, 0.33), (0.33, 0.2), (0.27, 0.12), (0.2, 0.17),
           (0.21, -0.37), (-0.21, -0.37),
           (-0.2, 0.17), (-0.27, 0.12), (-0.33, 0.2), (-0.2, 0.33)]
    return [(x * s, z * s * (h / 0.74)) for x, z in pts]


def _apply(ob, mod):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def _join(target, others):
    objs = [target] + others
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    return target


HANG_TEE = [(-0.085, -0.085), (-0.05, -0.113), (0.0, -0.122), (0.05, -0.113), (0.085, -0.085),
            (0.2, -0.13), (0.3, -0.2), (0.355, -0.32), (0.27, -0.365), (0.212, -0.275),
            (0.222, -0.62), (0.226, -0.795), (0.12, -0.812), (0.0, -0.818), (-0.12, -0.812), (-0.226, -0.795),
            (-0.222, -0.62), (-0.212, -0.275), (-0.27, -0.365), (-0.355, -0.32), (-0.3, -0.2), (-0.2, -0.13)]


def shirt_hanging(col):
    """a finished jersey on a hanger, soft: an extruded outline remeshed into a pillowy shell,
    then shaped — fuller at the chest, thin sleeves, drape folds falling from the shoulders.
    Origin at the hook top; the shirt faces -Y."""
    body = Part("shirt_hanging")
    body.prism(HANG_TEE, 0.07, (0, 0, 0), "Fabric")
    ob = body.build(col)
    rm = ob.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"; rm.voxel_size = 0.011; rm.adaptivity = 0.0
    _apply(ob, rm)
    sm = ob.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.8; sm.iterations = 6
    _apply(ob, sm)
    rnd = random.Random(3)
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    for v in ob.data.vertices:
        x, y, z = v.co
        ax = abs(x)
        torso = max(0.0, min(1.0, (0.235 - ax) / 0.05))          # 1 on the body, 0 out on the sleeves
        drop = max(0.0, min(1.0, (-z - 0.2) / 0.6))               # 0 at the shoulders → 1 at the hem
        chest = math.exp(-((z + 0.36) / 0.2) ** 2)
        depth = 0.42 + torso * (0.55 + 0.35 * chest - 0.25 * drop)
        y *= depth
        side = 1 if y >= 0 else -1
        # drape folds: a few soft vertical waves that deepen towards the hem, offset front/back
        f = (math.sin(x * 34 + ph[0] + side * 0.9) * 0.6 + math.sin(x * 61 + ph[1]) * 0.25) * torso
        y += side * 0.006 * f * (0.35 + drop)
        # the hem swings a little, the shoulders follow the hanger's slope
        x += math.sin(z * 9 + ph[2]) * 0.004 * drop
        if z > -0.2 and ax < 0.24:
            z -= 0.03 * (ax / 0.24) ** 1.5
        # sleeves hang: pull their ends down and in
        if ax > 0.215:
            k = (ax - 0.215) / 0.14
            z -= 0.03 * k
            x -= math.copysign(0.01 * k, x)
        v.co = (x, y, z)
    dec = ob.modifiers.new("decimate", "DECIMATE")
    dec.ratio = max(0.03, 900 / max(1, len(ob.data.polygons)))
    _apply(ob, dec)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    # rib collar, the neck label, and the hanger
    trim = Part("shirt_trim")
    trim.torus(0.088, 0.009, (0, -0.004, -0.088), "Fabric", rot=(pi / 2, 0, 0), arc=pi, n=16, n2=6, )
    trim.box((0.07, 0.003, 0.04), (0, 0.012, -0.12), "Laminate")
    trim.torus(0.018, 0.003, (0, 0, -0.02), "Chrome", rot=(pi / 2, 0, 0), arc=pi * 1.45, n=14, n2=6)
    trim.tube((0, 0, -0.038), (0, 0, -0.078), 0.0045, "Chrome", n=8)
    pts = [(-0.215, -0.142), (-0.15, -0.115), (-0.07, -0.092), (0, -0.082), (0.07, -0.092), (0.15, -0.115), (0.215, -0.142)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        trim.tube((x0, 0, z0), (x1, 0, z1), 0.009, "Black", n=8)
    t = trim.build(col)
    # the torus collar sits as a half ring around the front of the neckline
    t.data.update()
    ob = _join(ob, [t])
    ob.name = "shirt_hanging"
    return ob


def dress_form(col, arms=True, name="dress_form", arm_len=0.2):
    """a headless display form on a chrome pole — the way a kit shop shows a top.
    Floor at the origin; a kit at scale 0.26 sits on it with its origin at 1.25 m. Faces -Y."""
    bm = bmesh.new()
    J = 1.25
    # (height, half-width, half-depth, squareness) from the hip up to the neck
    rings = [(J - 0.58, 0.145, 0.098, 2.4), (J - 0.48, 0.156, 0.104, 2.4), (J - 0.36, 0.152, 0.101, 2.4), (J - 0.26, 0.152, 0.102, 2.3), (J - 0.12, 0.136, 0.095, 2.2),
             (J + 0.02, 0.15, 0.105, 2.2), (J + 0.14, 0.168, 0.114, 2.3), (J + 0.23, 0.18, 0.104, 2.6),
             (J + 0.285, 0.172, 0.085, 3.0), (J + 0.315, 0.124, 0.068, 2.6), (J + 0.335, 0.06, 0.052, 2.0),
             (J + 0.38, 0.052, 0.05, 2.0), (J + 0.405, 0.052, 0.05, 2.0)]
    N = 36
    loops = []
    for h, a, b_, e in rings:
        loop = []
        for i in range(N):
            t = 2 * pi * i / N
            c, s_ = cos(t), sin(t)
            x = a * math.copysign(abs(c) ** (2 / e), c)
            y = b_ * math.copysign(abs(s_) ** (2 / e), s_)
            # a touch of chest at the front, shoulder blades at the back
            if s_ < 0 and abs(h - (J + 0.14)) < 0.15:
                y *= 1.08
            loop.append(bm.verts.new((x, y, h)))
        loops.append(loop)
    for l1, l2 in zip(loops, loops[1:]):
        for i in range(N):
            bm.faces.new((l1[i], l1[(i + 1) % N], l2[(i + 1) % N], l2[i]))
    bot = bm.faces.new(loops[0][::-1])
    top = bm.faces.new(loops[-1])
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4], cuts=1, use_grid_fill=False)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.materials.append(MATS["FormGloss"])
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 1
    _apply(ob, sub)
    for poly in me.polygons:
        poly.use_smooth = True
    p = Part("form_stand")
    # arms held out along the sleeve line, so a short sleeve sits round them as when worn
    A, L = 56, arm_len   # display arms end inside a short sleeve; the drape uses longer ones
    for sx in ((1, -1) if arms else ()):
        sh = Vector((sx * 0.15, 0.0, J + 0.24))
        d = Vector((sx * math.sin(radians(A)), 0.0, -math.cos(radians(A))))
        end = sh + d * L
        p.cyl(0.04, L, tuple((sh + end) / 2), "FormGloss", rot=(0, -sx * radians(A), 0), r2=0.052, n=24, cap=False)
        bs = bmesh.new()
        bmesh.ops.create_uvsphere(bs, u_segments=20, v_segments=10, radius=0.052)
        p._add(bs, "FormGloss", Matrix.Translation(sh))
        bs = bmesh.new()
        bmesh.ops.create_uvsphere(bs, u_segments=20, v_segments=10, radius=0.04)
        p._add(bs, "FormGloss", Matrix.Translation(end))
    p.cyl(0.054, 0.012, (0, 0, J + 0.41), "Chrome", n=24, bevel=0.004)  # neck cap
    p.cyl(0.035, 0.02, (0, 0, J - 0.59), "Chrome", n=20)
    p.cyl(0.013, J - 0.6, (0, 0, (J - 0.6) / 2), "Chrome", n=14)  # pole
    p.cyl(0.03, 0.08, (0, 0, 0.36), "Chrome", n=16, bevel=0.006)  # height collar
    p.cyl(0.19, 0.03, (0, 0, 0.015), "SteelDark", n=40, bevel=0.01)  # weighted base
    p.cyl(0.05, 0.02, (0, 0, 0.04), "Chrome", n=20)
    s = p.build(col)
    ob = _join(ob, [s])
    ob.name = name
    return ob


def garment_rack(col):
    """rolling chrome rack, 1.8 wide, rail at 1.75 m"""
    p = Part("garment_rack")
    W, H = 1.8, 1.75
    for x in (-W / 2, W / 2):
        p.tube((x, 0, 0.12), (x, 0, H), 0.016, "Chrome", n=12)
        p.tube((x, -0.3, 0.12), (x, 0.3, 0.12), 0.016, "Chrome", n=12)
        for y in (-0.3, 0.3):
            p.cyl(0.035, 0.03, (x, y, 0.045), "Rubber", rot=(pi / 2, 0, 0), n=14)
            p.box((0.05, 0.05, 0.05), (x, y, 0.09), "Steel")
    p.tube((-W / 2 - 0.03, 0, H), (W / 2 + 0.03, 0, H), 0.014, "Chrome", n=12)
    p.tube((-W / 2, 0, 0.12), (W / 2, 0, 0.12), 0.012, "Chrome", n=10)
    return p.build(col)


def calender(col):
    """rotary heat-transfer (sublimation) calender: heated drum, felt, feed tables, control panel.
    About 2.9 wide (along X), 1.5 deep, 1.55 tall."""
    p = Part("calender")
    L = 2.4
    # side housings
    for x in (-L / 2 - 0.22, L / 2 + 0.22):
        p.box((0.36, 1.2, 1.45), (x, 0, 0.725), "Cream", bevel=0.04, seg=3)
        p.box((0.37, 1.22, 0.06), (x, 0, 0.05), "SteelDark", bevel=0.01)
        p.box((0.372, 0.04, 0.9), (x, -0.4, 0.75), "RackOrange", bevel=0.01)  # accent stripe
        p.cyl(0.19, 0.38, (x, 0, 0.95), "Steel", rot=(0, pi / 2, 0), n=28, bevel=0.01)  # bearing cover
    # the drum and the felt blanket wrapped around its lower back
    p.cyl(0.42, L, (0, 0, 0.95), "Chrome", rot=(0, pi / 2, 0), n=48)
    p.cyl(0.435, L - 0.08, (0, 0.03, 0.9), "Felt", rot=(0, pi / 2, 0), n=48)
    # guide rollers
    for y, z in ((-0.62, 0.62), (0.62, 0.62), (0.55, 1.42), (-0.5, 1.32)):
        p.cyl(0.05, L, (0, y, z), "Alu", rot=(0, pi / 2, 0), n=16)
    # feed and take-off tables
    p.box((L, 0.7, 0.04), (0, -1.0, 0.86), "Alu", bevel=0.01)
    p.box((L, 0.5, 0.04), (0, 0.95, 0.7), "Alu", bevel=0.01, rot=(radians(-14), 0, 0))
    for x in (-L / 2 + 0.1, L / 2 - 0.1):
        p.tube((x, -1.25, 0), (x, -1.25, 0.84), 0.02)
    p.cyl(0.11, L - 0.1, (0, 1.05, 0.28), "Fabric", rot=(0, pi / 2, 0), n=24)  # printed roll coming off
    # control panel on a post
    p.box((0.08, 0.08, 1.1), (L / 2 + 0.6, -0.5, 0.55), "SteelDark")
    p.box((0.42, 0.12, 0.34), (L / 2 + 0.6, -0.55, 1.22), "Cream", bevel=0.02, rot=(radians(-15), 0, 0))
    p.box((0.3, 0.01, 0.18), (L / 2 + 0.6, -0.615, 1.24), "Screen", rot=(radians(-15), 0, 0))
    p.cyl(0.03, 0.03, (L / 2 + 0.47, -0.6, 1.12), "RackOrange", rot=(pi / 2, 0, 0), n=12)  # e-stop
    p.box((0.6, 0.004, 0.12), (0, -0.605, 1.32), "Black", bevel=0.004)  # name plate band
    return p.build(col)


def cut_table(col):
    """the long print/cutting table, 3.8 × 2.5, top at 0.82"""
    p = Part("cut_table")
    W, D, T = 3.8, 2.5, 0.82
    p.box((W, D, 0.04), (0, 0, T - 0.02), "Laminate", bevel=0.008)
    p.box((W + 0.02, D + 0.02, 0.06), (0, 0, T - 0.07), "Steel", bevel=0.006)
    for x in (-W / 2 + 0.1, 0, W / 2 - 0.1):
        for y in (-D / 2 + 0.1, D / 2 - 0.1):
            p.box((0.06, 0.06, T - 0.1), (x, y, (T - 0.1) / 2), "Steel")
            p.box((0.1, 0.1, 0.02), (x, y, 0.01), "Rubber")
    p.box((W - 0.2, 0.04, 0.04), (0, -D / 2 + 0.1, 0.18), "Steel")
    p.box((W - 0.2, 0.04, 0.04), (0, D / 2 - 0.1, 0.18), "Steel")
    p.box((W - 0.1, D - 0.3, 0.02), (0, 0, 0.2), "SteelDark")  # lower shelf
    for i in range(3):
        p.box((0.5, 0.4, 0.06), (-1.2 + i * 1.1, 0.2, 0.24), "Fabric", bevel=0.02)  # stacked panels below
    p.box((W - 0.2, 0.03, 0.004), (0, -D / 2 + 0.03, T + 0.002), "Yellow")  # ruler strip
    return p.build(col)


def column(col):
    """steel I-beam column, 14 m, with base plate and bolts"""
    p = Part("column")
    H = 14
    p.box((0.42, 0.03, H), (0, 0, H / 2), "Steel")  # web
    for y in (-0.19, 0.19):
        p.box((0.42, 0.025, H), (0, y, H / 2), "Steel")  # flanges (rotated I: flanges front/back)
    p.box((0.03, 0.4, H), (0, 0, H / 2), "Steel")
    p.box((0.7, 0.7, 0.03), (0, 0, 0.015), "SteelDark")
    for x in (-0.27, 0.27):
        for y in (-0.27, 0.27):
            p.cyl(0.025, 0.06, (x, y, 0.05), "Chrome", n=6)
    p.box((0.44, 0.44, 0.9), (0, 0, 0.45), "Yellow", bevel=0.01)  # safety paint at the foot
    for k in range(5):
        p.box((0.445, 0.445, 0.08), (0, 0, 0.12 + k * 0.18), "Black")
    return p.build(col)


def truss(col):
    """roof truss bay, 6 m long along X, 1.2 m deep, chords and diagonals"""
    p = Part("truss")
    L, Hh = 6.0, 1.2
    for z in (0, Hh):
        p.box((L, 0.14, 0.14), (0, 0, z), "Steel")
    n = 6
    for i in range(n + 1):
        x = -L / 2 + i * L / n
        p.box((0.08, 0.1, Hh), (x, 0, Hh / 2), "Steel")
        if i < n:
            x2 = x + L / n
            a, b = ((x, 0, 0), (x2, 0, Hh)) if i % 2 == 0 else ((x, 0, Hh), (x2, 0, 0))
            p.tube(a, b, 0.035, "Steel", n=6)
    # purlins across
    for x in (-L / 2 + 0.5, 0, L / 2 - 0.5):
        p.box((0.1, 6.0, 0.12), (x, 0, Hh + 0.12), "SteelDark")
    return p.build(col)


def wall_fan(col):
    """box exhaust fan in the wall, 1.4 m, facing -Y"""
    p = Part("wall_fan")
    S = 1.4
    for x in (-S / 2, S / 2):
        p.box((0.06, 0.4, S), (x, 0.2, 0), "Alu")
    for z in (-S / 2, S / 2):
        p.box((S, 0.4, 0.06), (0, 0.2, z), "Alu")
    p.cyl(0.62, 0.3, (0, 0.2, 0), "Alu", rot=(pi / 2, 0, 0), cap=False, n=40)  # shroud
    for r in (0.15, 0.3, 0.45, 0.6):
        p.torus(r, 0.006, (0, -0.02, 0), "Chrome", rot=(pi / 2, 0, 0), n=36, n2=5)
    for i in range(8):
        a = i * pi / 8
        p.box((1.24, 0.006, 0.012), (0, -0.02, 0), "Chrome", rot=(0, a, 0))
    for i in range(6):
        a = i * pi / 3
        p.box((0.5, 0.01, 0.17), (cos(a) * 0.3, 0.22, sin(a) * 0.3), "Alu", rot=(radians(25), -a, 0))
    p.cyl(0.12, 0.22, (0, 0.28, 0), "SteelDark", rot=(pi / 2, 0, 0), n=20)
    return p.build(col)


def carton(col):
    """shipping carton 0.6 × 0.4 × 0.4 with tape and a label"""
    p = Part("carton")
    p.box((0.6, 0.4, 0.4), (0, 0, 0.2), "Cardboard", bevel=0.008)
    p.box((0.605, 0.07, 0.003), (0, 0, 0.401), "Tape")
    p.box((0.003, 0.07, 0.12), (0.301, 0, 0.34), "Tape")
    p.box((0.003, 0.07, 0.12), (-0.301, 0, 0.34), "Tape")
    p.box((0.16, 0.002, 0.1), (0.15, -0.201, 0.22), "Laminate")
    p.box((0.05, 0.002, 0.05), (-0.2, -0.201, 0.3), "RackOrange")  # Axiom mark
    return p.build(col)


def pallet(col):
    """wooden pallet 1.2 × 1.0"""
    p = Part("pallet")
    for i in range(7):
        p.box((0.1, 1.0, 0.022), (-0.55 + i * (1.1 / 6), 0, 0.133), "Wood", bevel=0.004)
    for y in (-0.44, 0, 0.44):
        p.box((1.2, 0.1, 0.022), (0, y, 0.111), "Wood", bevel=0.004)
        for x in (-0.55, 0, 0.55):
            p.box((0.12, 0.1, 0.08), (x, y, 0.06), "Wood", bevel=0.004)
    for i in range(3):
        p.box((0.1, 1.0, 0.022), (-0.55 + i * 0.55, 0, 0.011), "Wood")
    return p.build(col)


def trolley(col):
    """flat-bed trolley with a stack of folded kit"""
    p = Part("trolley")
    p.box((1.0, 0.6, 0.04), (0, 0, 0.22), "SteelDark", bevel=0.01)
    p.tube((0.5, -0.28, 0.24), (0.55, -0.28, 1.0), 0.015, "RackOrange")
    p.tube((0.5, 0.28, 0.24), (0.55, 0.28, 1.0), 0.015, "RackOrange")
    p.tube((0.55, -0.28, 1.0), (0.55, 0.28, 1.0), 0.015, "RackOrange")
    for x in (-0.4, 0.4):
        for y in (-0.24, 0.24):
            p.cyl(0.07, 0.04, (x, y, 0.08), "Rubber", rot=(pi / 2, 0, 0), n=16)
    for k in range(6):
        p.box((0.36, 0.28, 0.035), (-0.18, 0.0, 0.26 + k * 0.036), "Fabric", bevel=0.012)
        p.box((0.36, 0.28, 0.035), (0.22, 0.0, 0.26 + k * 0.036), "Fabric", bevel=0.012)
    return p.build(col)


HIP_WAIST = 1.05  # height of the hip form's waist (metres) — the shorts are built to it


def hip_form(col, name="hip_form"):
    """a lower-body form (waist to above the knee) on a chrome pole, for shorts.
    Floor at the origin, waist at HIP_WAIST, faces -Y like the dress form."""
    W = HIP_WAIST
    parts = []
    # pelvis: (height, half-width, half-depth, squareness), closed at the crotch
    rings = [(W + 0.05, 0.138, 0.098, 2.4), (W, 0.142, 0.1, 2.4), (W - 0.07, 0.16, 0.112, 2.4),
             (W - 0.15, 0.176, 0.12, 2.5), (W - 0.21, 0.177, 0.118, 2.5), (W - 0.25, 0.168, 0.11, 2.4),
             (W - 0.275, 0.14, 0.095, 2.2)]
    bm = bmesh.new()
    N = 40
    loops = []
    for h, a, b_, e in rings:
        loop = []
        for i in range(N):
            t = 2 * pi * i / N
            c, s_ = cos(t), sin(t)
            x = a * math.copysign(abs(c) ** (2 / e), c)
            y = b_ * math.copysign(abs(s_) ** (2 / e), s_)
            if s_ > 0 and h < W - 0.1:
                y *= 1.1  # seat
            loop.append(bm.verts.new((x, y, h)))
        loops.append(loop)
    for l1, l2 in zip(loops, loops[1:]):
        for i in range(N):
            bm.faces.new((l1[i], l1[(i + 1) % N], l2[(i + 1) % N], l2[i]))
    bm.faces.new(loops[0][::-1])
    bm.faces.new(loops[-1])
    me = bpy.data.meshes.new(name + "_pelvis")
    bm.to_mesh(me); bm.free()
    pelvis = bpy.data.objects.new(name, me)
    col.objects.link(pelvis)
    # thighs, splayed a little, ending above the knee
    for sx in (1, -1):
        bm = bmesh.new()
        loops = []
        for k, (h, r) in enumerate([(W - 0.17, 0.086), (W - 0.24, 0.09), (W - 0.33, 0.083), (W - 0.45, 0.07), (W - 0.56, 0.06)]):
            cx = sx * (0.086 + 0.014 * k / 4)
            loop = [bm.verts.new((cx + r * cos(2 * pi * i / 28), r * 1.02 * sin(2 * pi * i / 28) + 0.006, h)) for i in range(28)]
            loops.append(loop)
        for l1, l2 in zip(loops, loops[1:]):
            for i in range(28):
                bm.faces.new((l1[i], l1[(i + 1) % 28], l2[(i + 1) % 28], l2[i]))
        bm.faces.new(loops[0][::-1])
        bm.faces.new(loops[-1])
        lme = bpy.data.meshes.new(name + "_leg")
        bm.to_mesh(lme); bm.free()
        leg = bpy.data.objects.new(name + "_leg", lme)
        col.objects.link(leg)
        parts.append(leg)
    _join(pelvis, parts)
    # one smooth skin over pelvis and thighs
    rm = pelvis.modifiers.new("rm", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.006
    _apply(pelvis, rm)
    sm = pelvis.modifiers.new("sm", "CORRECTIVE_SMOOTH")
    sm.factor = 1.0
    sm.iterations = 20
    sm.rest_source = "ORCO"
    sm.smooth_type = "SIMPLE"
    _apply(pelvis, sm)
    sm = pelvis.modifiers.new("sm2", "SMOOTH")
    sm.factor = 0.8
    sm.iterations = 12
    _apply(pelvis, sm)
    dec = pelvis.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.12  # light enough for the web; it's smooth-shaded
    _apply(pelvis, dec)
    for poly in pelvis.data.polygons:
        poly.use_smooth = True
    pelvis.data.materials.clear()
    pelvis.data.materials.append(MATS["FormGloss"])
    p = Part("hip_stand")
    p.cyl(0.05, 0.012, (0, 0, W + 0.056), "Chrome", n=24, bevel=0.004)   # waist cap
    p.cyl(0.013, W - 0.27, (0, 0, (W - 0.27) / 2), "Chrome", n=14)       # pole up to the crotch
    p.cyl(0.03, 0.08, (0, 0, 0.3), "Chrome", n=16, bevel=0.006)           # height collar
    p.cyl(0.19, 0.03, (0, 0, 0.015), "SteelDark", n=40, bevel=0.01)       # weighted base
    p.cyl(0.05, 0.02, (0, 0, 0.04), "Chrome", n=20)
    for sx in (1, -1):  # chrome caps on the cut thighs
        p.cyl(0.058, 0.008, (sx * 0.1, 0.006, W - 0.564), "Chrome", n=24, bevel=0.003)
    st = p.build(col)
    ob = _join(pelvis, [st])
    ob.name = name
    return ob


def dress_form_sleeveless(col):
    """the same form without arms, for singlets"""
    return dress_form(col, arms=False, name="dress_form_sleeveless")


PROPS = [sewing_station, work_cloth, highbay, roll_rack, fabric_roll, shirt_hanging, dress_form, dress_form_sleeveless, hip_form, garment_rack,
         calender, cut_table, column, truss, wall_fan, carton, pallet, trolley]


def build():
    materials()
    col = bpy.data.collections.get("AxiomFactoryKit") or bpy.data.collections.new("AxiomFactoryKit")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        bpy.data.objects.remove(o)
    obs = [fn(col) for fn in PROPS]
    return col, obs


def layout_preview(obs):
    """spread the props out on a floor so they can be looked at together"""
    spots = {
        "sewing_station": (0, 0, 0), "work_cloth": (0, 0, 0), "highbay": (-3, 1, 3.2), "roll_rack": (-4.5, 2.5, 0),
        "fabric_roll": None, "shirt_hanging": None, "garment_rack": (3.6, 2.2, 0), "calender": (0, 4.5, 0),
        "cut_table": (-1.2, -3.2, 0), "column": (6.5, 4, 0), "truss": (0, 5, 6), "wall_fan": (-7, 6, 2.2),
        "carton": None, "pallet": (5.5, -2.2, 0), "trolley": (3.4, -1.2, 0), "dress_form": (1.6, -1.6, 0),
    }
    for o in obs:
        s = spots.get(o.name)
        if s:
            o.location = s
    by = {o.name: o for o in obs}
    # rolls on the rack, shirts on the rail, cartons on the pallet — as linked duplicates
    col = obs[0].users_collection[0]
    palette = [(0.95, 0.4, 0.13), (0.18, 0.43, 0.84), (0.89, 0.23, 0.23), (0.95, 0.94, 0.92), (0.11, 0.12, 0.14), (0.96, 0.77, 0.09), (0.16, 0.66, 0.42)]
    def dup(src, loc, rot=(0, 0, 0)):
        o = src.copy()
        o.location = loc
        o.rotation_euler = rot
        col.objects.link(o)
        return o
    for lv in range(4):
        for k in range(3):
            z = 0.14 + lv * 0.95 + 0.22
            dup(by["fabric_roll"], (-4.5 + (k - 1) * 0.0, 2.5 - 0.3 + k * 0.3, z) if False else (-4.5, 2.5 + (k - 1) * 0.36, z))
    by["fabric_roll"].location = (-4.5, 2.5 - 0.36, 0.36)
    for i in range(10):
        dup(by["shirt_hanging"], (3.6 - 0.8 + i * 0.17, 2.2, 1.75), (0, 0, pi / 2 + random.uniform(-0.1, 0.1)))
    by["shirt_hanging"].location = (3.6 - 0.8 - 0.17, 2.2, 1.75)
    by["shirt_hanging"].rotation_euler = (0, 0, pi / 2)
    for i in range(6):
        dup(by["carton"], (5.5 + (i % 2) * 0.6 - 0.3, -2.2 + ((i // 2) % 1) * 0.4, 0.146 + (i // 2) * 0.4))
    by["carton"].location = (5.5, -1.8, 0.146)


def preview_scene():
    sc = bpy.context.scene
    floor = bpy.data.objects.get("PreviewFloor")
    if not floor:
        me = bpy.data.meshes.new("PreviewFloor")
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
        bm.to_mesh(me)
        floor = bpy.data.objects.new("PreviewFloor", me)
        sc.collection.objects.link(floor)
        floor.data.materials.append(mat("Concrete", srgb("#55575a"), rough=0.45))
    cam = bpy.data.objects.get("PreviewCam")
    if not cam:
        cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
        sc.collection.objects.link(cam)
    cam.location = (9.5, -11.5, 5.4)
    cam.rotation_euler = (radians(70), 0, radians(40))
    cam.data.lens = 32
    sc.camera = cam
    sun = bpy.data.objects.get("PreviewSun")
    if not sun:
        sun = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", "SUN"))
        sc.collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.86, 0.7)
    sun.rotation_euler = (radians(50), radians(10), radians(-30))
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.05, 0.055, 0.065, 1)
    bg.inputs[1].default_value = 1.0


def export(obs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.location = (0, 0, 0)
        o.rotation_euler = (0, 0, 0)
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_materials="EXPORT")
    print("exported", path, flush=True)


if __name__ == "__main__":
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    col, obs = build()
    for o in obs:
        me = o.data
        print(f"{o.name:16s} tris={sum(len(p.vertices) - 2 for p in me.polygons):6d} mats={[m.name for m in me.materials]}", flush=True)
    if OUT:
        import os
        os.makedirs(OUT, exist_ok=True)
        export(obs, os.path.join(OUT, "factory_kit.glb"))
    layout_preview(obs)
    preview_scene()
    if RENDER and OUT:
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 48
        sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y = 1600, 900
        sc.render.filepath = os.path.join(OUT, "kit_preview.png")
        bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "factory_kit.blend"))
