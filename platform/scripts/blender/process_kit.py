"""
Axiom process kit — the machines of the production line on /process.

Builds on factory_kit.py (same materials and Part helper). Each prop is built
at the origin standing on the floor, front facing -Y (+Z in glTF, toward the
web camera). Moving parts are separate objects with their pivot at the origin,
so the web can animate them:

  printer_head   print carriage; slides along X on the printer at (0, -0.24, 1.07)
  laser_gantry   the beam; slides along Y over the bed at height 0.9
  laser_head     rides the gantry along X
  press_upper    clamshell top; hinge at (0, 0.33, 1.12), opens by rotating about X
  truck_door     the cargo box's roll door; hangs down from its top edge

Material names the web reacts to: Fabric (tinted), Glow, Screen, LightPanel.

Run:  python process_kit.py -- <out_dir>        (bpy as a module)
      blender -b -P process_kit.py -- <out_dir>
"""
import os, sys
from math import pi, sin, cos, radians

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import factory_kit as fk  # noqa: E402
from factory_kit import Part, mat, srgb  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGV[0] if ARGV and not ARGV[0].startswith("--") else None


def materials():
    fk.materials()
    mat("InkC", srgb("#00a0d8"), rough=0.3, clearcoat=0.5)
    mat("InkM", srgb("#d6007e"), rough=0.3, clearcoat=0.5)
    mat("InkY", srgb("#f5d10a"), rough=0.3, clearcoat=0.5)
    mat("InkK", srgb("#16171a"), rough=0.3, clearcoat=0.5)
    mat("Glass", srgb("#0d1820"), metal=0.2, rough=0.06, clearcoat=1.0)
    mat("TruckWhite", srgb("#eceae4"), rough=0.35, clearcoat=0.6)
    mat("LightPanel", srgb("#f4f1ea"), emit=srgb("#fff8ee"), strength=1.4)
    mat("Silicone", srgb("#8b8f95"), rough=0.7)
    mat("PolyBag", srgb("#dfe6ea"), rough=0.15, clearcoat=0.8)
    mat("Paper", srgb("#f7f6f2"), rough=0.7)


# ------------------------------------------------------------------ 1 design desk
def design_desk(col):
    """designer's desk: big monitor (the web lays its own screen on it), side monitor,
    pen tablet, keyboard, office chair. Desk top at 0.75. Main screen face: centre
    (0, 0.084, 1.14), 0.74 × 0.42."""
    p = Part("design_desk")
    T = 0.75
    p.box((1.6, 0.8, 0.035), (0, 0.05, T - 0.0175), "Laminate", bevel=0.008)
    for x in (-0.74, 0.74):  # T-legs
        p.box((0.06, 0.06, T - 0.035), (x, 0.05, (T - 0.035) / 2), "SteelDark")
        p.box((0.07, 0.7, 0.04), (x, 0.05, 0.02), "SteelDark", bevel=0.006)
        p.box((0.07, 0.6, 0.04), (x, 0.05, T - 0.06), "SteelDark")
    p.box((1.42, 0.03, 0.3), (0, 0.4, T - 0.22), "SteelDark")  # modesty panel
    # main monitor
    p.box((0.26, 0.2, 0.014), (0, 0.18, T + 0.007), "Black", bevel=0.005)
    p.box((0.06, 0.04, 0.34), (0, 0.2, T + 0.18), "Alu", bevel=0.01)
    p.box((0.78, 0.035, 0.47), (0, 0.1025, 1.14), "Black", bevel=0.012)
    p.box((0.74, 0.004, 0.42), (0, 0.0855, 1.14), "Screen")
    p.box((0.05, 0.004, 0.012), (0, 0.084, 0.912), "Glow")  # power led
    # side monitor, angled in
    sx, sy = -0.66, 0.16
    rot = (0, 0, radians(28))
    p.box((0.2, 0.16, 0.012), (sx, sy + 0.06, T + 0.006), "Black", bevel=0.004, rot=rot)
    p.box((0.05, 0.035, 0.26), (sx, sy + 0.07, T + 0.14), "Alu", rot=rot)
    p.box((0.56, 0.03, 0.34), (sx, sy, 1.04), "Black", bevel=0.01, rot=rot)
    p.box((0.52, 0.004, 0.3), (sx + 0.0075, sy - 0.0141, 1.04), "Screen", rot=rot)
    # keyboard, mouse, pen tablet, mug, swatch book
    p.box((0.44, 0.14, 0.018), (-0.05, -0.17, T + 0.009), "Black", bevel=0.005)
    for r in range(4):
        p.box((0.4, 0.022, 0.004), (-0.05, -0.215 + r * 0.03, T + 0.019), "SteelDark")
    p.box((0.06, 0.1, 0.03), (0.26, -0.17, T + 0.015), "Black", bevel=0.014)
    p.box((0.34, 0.23, 0.01), (0.5, -0.12, T + 0.005), "Black", bevel=0.004, rot=(0, 0, radians(-8)))
    p.box((0.26, 0.17, 0.002), (0.5, -0.12, T + 0.011), "SteelDark", rot=(0, 0, radians(-8)))
    p.tube((0.42, -0.24, T + 0.012), (0.6, -0.2, T + 0.012), 0.006, "Black")  # pen
    p.cyl(0.04, 0.1, (0.7, 0.2, T + 0.05), "Cream", n=20, bevel=0.004)
    p.box((0.22, 0.12, 0.03), (-0.55, -0.15, T + 0.015), "RackOrange", bevel=0.006, rot=(0, 0, radians(12)))
    p.box((0.2, 0.1, 0.012), (-0.55, -0.15, T + 0.036), "Paper", rot=(0, 0, radians(16)))
    # office chair, pulled up to the desk
    cx, cy = 0.05, -0.62
    for a in range(5):
        ang = a * 2 * pi / 5 + pi / 2
        p.tube((cx, cy, 0.1), (cx + cos(ang) * 0.3, cy + sin(ang) * 0.3, 0.06), 0.018, "Black")
        p.cyl(0.03, 0.03, (cx + cos(ang) * 0.3, cy + sin(ang) * 0.3, 0.03), "Rubber", rot=(pi / 2, 0, ang), n=10)
    p.cyl(0.025, 0.32, (cx, cy, 0.27), "Chrome", n=12)
    p.box((0.5, 0.48, 0.08), (cx, cy, 0.47), "Black", bevel=0.03, seg=3)
    p.box((0.46, 0.06, 0.52), (cx, cy - 0.27, 0.8), "Black", bevel=0.03, seg=3, rot=(radians(-8), 0, 0))
    p.box((0.16, 0.04, 0.3), (cx, cy - 0.25, 0.6), "SteelDark", rot=(radians(-8), 0, 0))
    for s in (-1, 1):
        p.box((0.05, 0.26, 0.03), (cx + s * 0.27, cy - 0.02, 0.66), "Black", bevel=0.01)
        p.box((0.03, 0.03, 0.17), (cx + s * 0.27, cy - 0.08, 0.565), "SteelDark")
    return p.build(col)


# ------------------------------------------------------------------ 2 sublimation printer
def sub_printer(col):
    """large-format sublimation printer on its stand, 2.8 wide. Paper leaves the front
    slot at (y -0.29, z 0.98) and drops to the take-up roll."""
    p = Part("sub_printer")
    # stand
    for x in (-1.2, 1.2):
        p.box((0.08, 0.08, 0.72), (x, 0.0, 0.42), "SteelDark", bevel=0.01)
        p.box((0.1, 0.75, 0.05), (x, 0.0, 0.07), "SteelDark", bevel=0.01)
        for y in (-0.33, 0.33):
            p.cyl(0.035, 0.03, (x, y, 0.035), "Rubber", rot=(0, pi / 2, 0), n=12)
    p.box((2.4, 0.06, 0.06), (0, 0.0, 0.25), "SteelDark")
    # body: dark lower body, cream upper cover, end caps
    p.box((2.5, 0.56, 0.2), (0, 0.02, 0.97), "SteelDark", bevel=0.02)
    p.box((2.32, 0.44, 0.17), (0, 0.06, 1.15), "Cream", bevel=0.05, seg=3)
    p.box((2.3, 0.02, 0.07), (0, -0.165, 1.1), "Glass", bevel=0.006)  # window onto the carriage
    for x in (-1.36, 1.36):
        p.box((0.26, 0.62, 0.5), (x, 0.02, 1.02), "Cream", bevel=0.05, seg=3)
        p.box((0.262, 0.6, 0.03), (x, 0.02, 0.79), "SteelDark", bevel=0.006)
    # front lip and the slot the paper comes out of
    p.box((2.24, 0.06, 0.04), (0, -0.27, 0.99), "Black", bevel=0.01)
    p.box((2.2, 0.03, 0.012), (0, -0.295, 0.966), "Chrome")
    # control panel on the right cap
    p.box((0.18, 0.02, 0.11), (1.36, -0.3, 1.18), "Black", bevel=0.008, rot=(radians(-20), 0, 0))
    p.box((0.13, 0.004, 0.07), (1.36, -0.312, 1.185), "Screen", rot=(radians(-20), 0, 0))
    for i in range(3):
        p.cyl(0.008, 0.01, (1.31 + i * 0.05, -0.3, 1.105), "Chrome", rot=(pi / 2, 0, 0), n=8)
    # ink tanks on the left cap
    for i, m in enumerate(("InkC", "InkM", "InkY", "InkK")):
        p.box((0.045, 0.03, 0.16), (-1.44 + i * 0.055, -0.305, 1.0), m, bevel=0.006)
    p.box((0.24, 0.006, 0.02), (-1.36, -0.31, 1.1), "SteelDark")
    # brand strip
    p.box((0.4, 0.004, 0.025), (0.7, -0.162, 1.2), "RackOrange")
    # supply roll at the back, take-up roll at the front
    for x in (-1.12, 1.12):
        p.box((0.04, 0.04, 0.3), (x, 0.32, 0.7), "SteelDark")
        p.box((0.04, 0.3, 0.04), (x, -0.36, 0.42), "SteelDark", rot=(radians(30), 0, 0))
    p.cyl(0.085, 2.14, (0, 0.34, 0.62), "Paper", rot=(0, pi / 2, 0), n=28)
    p.cyl(0.02, 2.3, (0, 0.34, 0.62), "Steel", rot=(0, pi / 2, 0), n=10)
    p.cyl(0.06, 2.14, (0, -0.46, 0.34), "Paper", rot=(0, pi / 2, 0), n=24)
    p.cyl(0.018, 2.3, (0, -0.46, 0.34), "Steel", rot=(0, pi / 2, 0), n=10)
    return p.build(col)


def printer_head(col):
    """the print carriage, centred at its origin"""
    p = Part("printer_head")
    p.box((0.24, 0.16, 0.1), (0, 0, 0), "Black", bevel=0.012)
    p.box((0.2, 0.14, 0.02), (0, 0.01, 0.055), "Cream", bevel=0.006)
    p.box((0.05, 0.004, 0.02), (0.06, -0.081, 0.01), "Glow")
    p.box((0.16, 0.04, 0.03), (0, -0.05, -0.06), "SteelDark")
    return p.build(col)


# ------------------------------------------------------------------ 4 laser cutter
def laser_cutter(col):
    """flat-bed fabric laser, honeycomb bed 2.0 × 1.4 at 0.82, tube housing at the back"""
    p = Part("laser_cutter")
    B = 0.8
    p.box((2.3, 1.7, B - 0.08), (0, 0, (B - 0.08) / 2 + 0.06), "Cream", bevel=0.03)
    p.box((2.32, 1.72, 0.06), (0, 0, 0.03), "SteelDark", bevel=0.01)
    p.box((2.31, 0.01, 0.05), (0, -0.855, 0.5), "RackOrange")  # accent stripe
    for x in (-0.6, 0.6):  # door handles
        p.box((0.24, 0.02, 0.02), (x, -0.86, 0.66), "Chrome", bevel=0.006)
        p.box((1.0, 0.004, 0.5), (x, -0.851, 0.4), "SteelDark", bevel=0.004)
    # bed frame and honeycomb
    p.box((2.24, 1.64, 0.04), (0, 0, B), "SteelDark", bevel=0.008)
    p.box((2.02, 1.42, 0.01), (0, 0, B + 0.016), "Black")
    for i in range(21):
        p.box((0.006, 1.42, 0.004), (-1.0 + i * 0.1, 0, B + 0.022), "SteelDark")
    for i in range(15):
        p.box((2.02, 0.006, 0.004), (0, -0.7 + i * 0.1, B + 0.022), "SteelDark")
    # rails each side
    for x in (-1.1, 1.1):
        p.box((0.06, 1.64, 0.07), (x, 0, B + 0.055), "Alu", bevel=0.008)
    # tube housing and chiller at the back
    p.box((2.3, 0.28, 0.34), (0, 0.97, B + 0.1), "Cream", bevel=0.03)
    p.box((2.31, 0.01, 0.04), (0, 0.825, B + 0.2), "RackOrange")
    p.box((0.5, 0.5, 0.7), (1.55, 0.7, 0.35), "Cream", bevel=0.03)
    p.box((0.3, 0.004, 0.2), (1.55, 0.448, 0.45), "SteelDark")
    p.tube((1.4, 0.8, 0.7), (1.0, 0.95, B + 0.1), 0.02, "Black")
    # control console on a post at the front right
    p.box((0.06, 0.06, 0.4), (1.25, -0.82, B + 0.2), "SteelDark")
    p.box((0.32, 0.06, 0.22), (1.25, -0.84, B + 0.44), "Cream", bevel=0.02, rot=(radians(-25), 0, 0))
    p.box((0.22, 0.004, 0.13), (1.25, -0.873, B + 0.45), "Screen", rot=(radians(-25), 0, 0))
    p.cyl(0.03, 0.03, (1.37, -0.87, B + 0.35), "RackOrange", rot=(pi / 2, 0, 0), n=12)
    # safety marks
    for x in (-1.12, 1.12):
        p.box((0.06, 0.004, 0.6), (x, -0.856, 0.42), "Yellow")
    return p.build(col)


def laser_gantry(col):
    """the moving beam; origin at its centre, spans X"""
    p = Part("laser_gantry")
    p.box((2.16, 0.1, 0.08), (0, 0, 0), "Alu", bevel=0.01)
    p.box((2.16, 0.02, 0.03), (0, -0.06, 0.02), "SteelDark")
    for x in (-1.1, 1.1):
        p.box((0.12, 0.16, 0.12), (x, 0, -0.01), "Black", bevel=0.012)
    p.tube((-1.0, 0.07, 0.05), (1.0, 0.07, 0.05), 0.012, "RackOrange")  # cable chain
    return p.build(col)


def laser_head(col):
    """the head that rides the gantry; origin at its centre, nozzle tip at z -0.1"""
    p = Part("laser_head")
    p.box((0.09, 0.1, 0.12), (0, -0.08, 0), "Black", bevel=0.01)
    p.cyl(0.018, 0.06, (0, -0.08, -0.08), "Chrome", r2=0.008, n=12)
    p.box((0.04, 0.004, 0.02), (0, -0.131, 0.03), "RackOrange")
    return p.build(col)


# ------------------------------------------------------------------ 5 QC light table
def qc_table(col):
    """inspection table with a lit top (2.0 × 1.2 at 0.86) and a magnifier lamp"""
    p = Part("qc_table")
    T = 0.86
    p.box((2.0, 1.2, 0.02), (0, 0, T - 0.01), "LightPanel")
    for y in (-0.61, 0.61):
        p.box((2.04, 0.03, 0.05), (0, y, T - 0.02), "Alu", bevel=0.006)
    for x in (-1.01, 1.01):
        p.box((0.03, 1.25, 0.05), (x, 0, T - 0.02), "Alu", bevel=0.006)
    for x in (-0.94, 0.94):
        for y in (-0.54, 0.54):
            p.box((0.05, 0.05, T - 0.05), (x, y, (T - 0.05) / 2), "Steel")
            p.box((0.09, 0.09, 0.02), (x, y, 0.01), "Rubber")
    p.box((1.9, 1.1, 0.02), (0, 0, 0.22), "SteelDark")
    for i in range(3):
        p.box((0.5, 0.4, 0.05), (-0.6 + i * 0.6, 0.1, 0.255), "Fabric", bevel=0.02)
    # magnifier lamp clamped at the back right
    bx, by = 0.85, 0.58
    p.box((0.06, 0.06, 0.08), (bx, by, T + 0.03), "Black")
    p.tube((bx, by, T + 0.06), (bx - 0.05, by - 0.05, T + 0.5), 0.012, "Cream")
    p.tube((bx - 0.05, by - 0.05, T + 0.5), (bx - 0.3, by - 0.45, T + 0.42), 0.012, "Cream")
    p.torus(0.11, 0.022, (bx - 0.36, by - 0.55, T + 0.36), "Cream", rot=(radians(35), 0, 0), n=28, n2=8)
    p.cyl(0.095, 0.006, (bx - 0.36, by - 0.55, T + 0.36), "Glass", rot=(radians(35), 0, 0), n=28)
    p.torus(0.1, 0.006, (bx - 0.36, by - 0.55, T + 0.345), "Glow", rot=(radians(35), 0, 0), n=28, n2=5)
    # clipboard with the checklist
    p.box((0.24, 0.32, 0.008), (-0.8, -0.4, T + 0.004), "Laminate", rot=(0, 0, radians(-10)))
    p.box((0.2, 0.26, 0.002), (-0.8, -0.41, T + 0.009), "Paper", rot=(0, 0, radians(-10)))
    p.box((0.08, 0.03, 0.012), (-0.77, -0.27, T + 0.014), "Chrome", rot=(0, 0, radians(-10)))
    return p.build(col)


# ------------------------------------------------------------------ 8 heat press (size labels)
def heat_press(col):
    """clamshell press on its own small table. Lower pad top at 0.95. The top half
    is press_upper, hinged at (0, 0.33, 1.12)."""
    p = Part("heat_press")
    T = 0.8
    p.box((1.1, 0.75, 0.035), (0, 0.0, T - 0.0175), "Laminate", bevel=0.006)
    for x in (-0.5, 0.5):
        for y in (-0.32, 0.32):
            p.box((0.04, 0.04, T - 0.035), (x, y, (T - 0.035) / 2), "Steel")
    p.box((1.0, 0.65, 0.02), (0, 0, 0.18), "SteelDark")
    # press base
    p.box((0.5, 0.72, 0.1), (0, 0.04, T + 0.05), "Cream", bevel=0.02)
    p.box((0.44, 0.52, 0.04), (0, -0.04, T + 0.12), "SteelDark", bevel=0.008)
    p.box((0.42, 0.5, 0.012), (0, -0.04, 0.944), "Silicone", bevel=0.004)
    # the back column and the controller
    p.box((0.12, 0.12, 0.28), (0, 0.33, 0.98), "Cream", bevel=0.02)
    p.box((0.2, 0.1, 0.12), (0, 0.3, 0.78 + 0.32), "Black", bevel=0.01)
    p.box((0.12, 0.004, 0.05), (0, 0.248, 1.11), "Screen")
    # label reel and stack of size labels beside it
    p.cyl(0.07, 0.04, (0.42, 0.18, T + 0.02), "Paper", n=24)
    p.cyl(0.02, 0.05, (0.42, 0.18, T + 0.025), "Black", n=12)
    for i, m in enumerate(("Paper", "Paper", "Paper")):
        p.box((0.06, 0.04, 0.004), (0.4, -0.15 + i * 0.002, T + 0.002 + i * 0.004), m)
    return p.build(col)


def press_upper(col):
    """the top half of the press; origin at the hinge, closed when unrotated"""
    p = Part("press_upper")
    p.box((0.44, 0.52, 0.05), (0, -0.37, -0.145), "Alu", bevel=0.01)          # heated platen
    p.box((0.46, 0.54, 0.07), (0, -0.37, -0.085), "Cream", bevel=0.025, seg=3)  # cover
    p.box((0.1, 0.2, 0.08), (0, -0.06, -0.06), "Cream", bevel=0.02)            # arm to the hinge
    p.cyl(0.04, 0.16, (0, 0, 0), "SteelDark", rot=(0, pi / 2, 0), n=16)         # hinge barrel
    p.tube((-0.15, -0.64, -0.08), (-0.15, -0.66, 0.02), 0.012, "Chrome")
    p.tube((0.15, -0.64, -0.08), (0.15, -0.66, 0.02), 0.012, "Chrome")
    p.tube((-0.17, -0.66, 0.02), (0.17, -0.66, 0.02), 0.02, "Black")            # handle
    return p.build(col)


# ------------------------------------------------------------------ 9 pack table
def pack_table(col):
    """packing bench, top at 0.82, with a bag roll, tape gun, label printer"""
    p = Part("pack_table")
    T = 0.82
    W, D = 1.9, 0.9
    p.box((W, D, 0.035), (0, 0, T - 0.0175), "Laminate", bevel=0.006)
    for x in (-W / 2 + 0.06, W / 2 - 0.06):
        for y in (-D / 2 + 0.06, D / 2 - 0.06):
            p.box((0.05, 0.05, T - 0.035), (x, y, (T - 0.035) / 2), "Steel")
    p.box((W - 0.1, D - 0.1, 0.02), (0, 0, 0.2), "SteelDark")
    for i in range(6):  # flat cartons waiting below
        p.box((0.9, 0.6, 0.012), (-0.35, 0.05, 0.215 + i * 0.013), "Cardboard")
    # bag roll on a rack at the back
    for x in (-0.75, 0.1):
        p.box((0.03, 0.03, 0.4), (x, D / 2 - 0.05, T + 0.2), "Steel")
    p.cyl(0.07, 0.8, (-0.325, D / 2 - 0.05, T + 0.34), "PolyBag", rot=(0, pi / 2, 0), n=24)
    p.cyl(0.015, 0.9, (-0.325, D / 2 - 0.05, T + 0.34), "Steel", rot=(0, pi / 2, 0), n=10)
    # tape gun
    tx, ty = 0.72, -0.2
    p.cyl(0.07, 0.05, (tx, ty, T + 0.1), "Tape", rot=(pi / 2, 0, 0), n=24)
    p.box((0.2, 0.03, 0.04), (tx - 0.02, ty, T + 0.03), "RackOrange", bevel=0.008)
    p.box((0.03, 0.03, 0.14), (tx - 0.09, ty, T + 0.08), "Black", bevel=0.01, rot=(0, radians(20), 0))
    # label printer
    p.box((0.2, 0.24, 0.16), (0.68, 0.22, T + 0.08), "Cream", bevel=0.02)
    p.box((0.12, 0.004, 0.05), (0.68, 0.098, T + 0.12), "Screen")
    p.box((0.08, 0.06, 0.003), (0.68, 0.06, T + 0.02), "Paper")
    return p.build(col)


# ------------------------------------------------------------------ 10 delivery truck
def delivery_truck(col):
    """a six-wheel box truck, 6.4 long along X with the cab at +X, rear (open) at
    x −3.0; cargo floor at 0.95, box 2.3 wide × 2.3 tall inside."""
    p = Part("delivery_truck")
    # chassis
    for y in (-0.42, 0.42):
        p.box((5.8, 0.1, 0.22), (-0.1, y, 0.62), "SteelDark")
    # cargo box: floor, roof, sides, front wall; rear left open
    x0, x1 = -3.0, 1.4
    L = x1 - x0
    cx = (x0 + x1) / 2
    zf, H, Wd = 0.95, 2.35, 2.3
    p.box((L, Wd, 0.08), (cx, 0, zf - 0.04), "SteelDark")
    p.box((L - 0.04, Wd - 0.1, 0.02), (cx, 0, zf + 0.01), "Wood")
    p.box((L, Wd, 0.06), (cx, 0, zf + H + 0.03), "TruckWhite", bevel=0.02)
    for y in (-Wd / 2 + 0.025, Wd / 2 - 0.025):
        p.box((L, 0.05, H), (cx, y, zf + H / 2), "TruckWhite", bevel=0.01)
        p.box((L - 0.2, 0.012, 0.32), (cx + 0.1, y + (0.026 if y > 0 else -0.026), zf + 0.55), "RackOrange")
        p.box((L - 0.2, 0.012, 0.05), (cx + 0.1, y + (0.026 if y > 0 else -0.026), zf + 0.3), "SteelDark")
    p.box((0.06, Wd, H), (x1 - 0.03, 0, zf + H / 2), "TruckWhite", bevel=0.01)
    # rear frame and the door box at the top of the opening
    for y in (-Wd / 2 + 0.04, Wd / 2 - 0.04):
        p.box((0.08, 0.1, H), (x0, y, zf + H / 2), "Alu", bevel=0.01)
    p.box((0.2, Wd, 0.16), (x0 + 0.1, 0, zf + H - 0.06), "Alu", bevel=0.01)
    p.box((0.12, Wd - 0.2, 0.06), (x0 - 0.04, 0, zf - 0.08), "SteelDark")  # rear step
    for y in (-0.8, 0.8):
        p.box((0.04, 0.16, 0.08), (x0 - 0.02, y, zf - 0.2), "RackOrange", bevel=0.01)  # tail lights housing
        p.box((0.01, 0.12, 0.05), (x0 - 0.045, y, zf - 0.2), "Glow")
    # cab
    cx2 = 2.25
    p.box((1.5, 2.2, 1.55), (cx2, 0, 1.55), "TruckWhite", bevel=0.1, seg=3)
    p.box((1.3, 2.18, 0.4), (cx2 + 0.05, 0, 0.62), "TruckWhite", bevel=0.05)
    p.box((0.05, 1.9, 0.75), (cx2 + 0.75, 0, 1.85), "Glass", bevel=0.02, rot=(0, radians(-6), 0))  # windscreen
    for y in (-1.1, 1.1):
        p.box((0.8, 0.02, 0.55), (cx2 + 0.1, y, 1.85), "Glass", bevel=0.01)  # side windows
        p.box((0.04, 0.02, 0.6), (cx2 - 0.3, y * 1.001, 1.1), "Black")  # door gap
        p.tube((cx2 + 0.62, y, 1.85), (cx2 + 0.7, y * 1.2, 1.8), 0.012, "Black")
        p.box((0.06, 0.04, 0.24), (cx2 + 0.7, y * 1.22, 1.72), "Black", bevel=0.01)  # mirrors
    p.box((0.04, 1.4, 0.4), (cx2 + 0.77, 0, 1.0), "Black", bevel=0.01)  # grille
    for k in range(5):
        p.box((0.045, 1.3, 0.02), (cx2 + 0.775, 0, 0.86 + k * 0.07), "SteelDark")
    for y in (-0.82, 0.82):
        p.box((0.04, 0.3, 0.14), (cx2 + 0.765, y, 1.02), "Glow", bevel=0.01)  # headlights
    p.box((0.16, 2.2, 0.2), (cx2 + 0.75, 0, 0.5), "SteelDark", bevel=0.02)  # bumper
    p.box((0.02, 0.5, 0.12), (cx2 + 0.835, 0, 0.5), "Paper")  # plate
    p.box((0.4, 2.0, 0.12), (cx2 - 0.4, 0, 2.38), "TruckWhite", bevel=0.04)  # roof fairing
    # wheels: front axle and twin rear
    for wx, twin in ((2.15, False), (-1.45, True)):
        for y in (-0.92, 0.92):
            for k in ((0, 0.14) if twin else (0,)):
                yy = y + (k if y > 0 else -k)
                p.cyl(0.43, 0.24, (wx, yy, 0.43), "Rubber", rot=(pi / 2, 0, 0), n=28, bevel=0.03)
            p.cyl(0.24, 0.02, (wx, y * 1.0 + (0.13 if y > 0 else -0.13) * (1.6 if twin else 1), 0.43), "Alu", rot=(pi / 2, 0, 0), n=20)
        p.box((0.95, 2.36, 0.06), (wx, 0, 0.92), "Black", bevel=0.01)  # mudguards
    # fuel tank
    p.cyl(0.2, 0.9, (0.6, -0.65, 0.55), "Alu", rot=(0, pi / 2, 0), n=20)
    return p.build(col)


def truck_door(col):
    """the cargo roll door; origin at its top edge, hangs down 2.2 m (scale it in Z to roll up)"""
    p = Part("truck_door")
    H, W = 2.22, 2.16
    p.box((0.03, W, H), (0, 0, -H / 2), "Alu", bevel=0.004)
    for k in range(10):
        p.box((0.036, W, 0.012), (0, 0, -0.1 - k * 0.22), "SteelDark")
    p.box((0.05, 0.4, 0.04), (-0.02, 0, -H + 0.1), "Black", bevel=0.01)  # handle
    return p.build(col)


PROPS = [design_desk, sub_printer, printer_head, laser_cutter, laser_gantry, laser_head, qc_table,
         heat_press, press_upper, pack_table, delivery_truck, truck_door]


def build():
    materials()
    col = bpy.data.collections.get("AxiomProcessKit") or bpy.data.collections.new("AxiomProcessKit")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        bpy.data.objects.remove(o)
    return col, [fn(col) for fn in PROPS]


if __name__ == "__main__":
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    fk.MATS.clear()
    col, obs = build()
    for o in obs:
        me = o.data
        print(f"{o.name:16s} tris={sum(len(p.vertices) - 2 for p in me.polygons):6d} mats={[m.name for m in me.materials]}", flush=True)
    if OUT:
        os.makedirs(OUT, exist_ok=True)
        fk.export(obs, os.path.join(OUT, "process_kit.glb"))
