/**
 * Jerseys for the storefront scenes, with every colourable part separate.
 *
 * loadJersey() first loads the kit's Blender model
 * (public/models/kits/<kit>.glb, made by platform/scripts/blender/build_kits_v3.py): front
 * and back panels sewn together with real openings at the neck, cuffs and hem,
 * one material per part — Body, Sleeve, Trim_Neck, Trim_Arm, Trim_Hem (+ Waistband,
 * Hood, Pocket, Cord on bottoms and the hoodie; Lining inside). If that
 * file can't be loaded it falls back to buildJersey(), a jersey built in code.
 *
 * Either way the Body is painted by one shader — pattern, hem band and the
 * name/number — in the shirt's own object-space coordinates, so a pattern
 * stays put while the camera orbits.
 *
 * Works with Three.js r128 (window.THREE from lib/three-cdn).
 */

import type { FabricId, FontId, KitColors, KitCut, PatternId } from "./kits";
import { FONTS, trimEdges } from "./kits";
import type { TrimId } from "./garment-options";

export interface JerseyLook {
  colors: KitColors;
  pattern: PatternId;
  trim: TrimId;
  fabric: FabricId;
  name: string;
  number: string;
  font: FontId;
  /** CSS family of a team's own imported font (lib/kit-assets); wins over `font` */
  fontFamily?: string;
  /** chest logo: a data: URL of the team's logo, null for none, absent for the Axiom mark */
  logo?: string | null;
  /** print the logo in the number colour (one-colour print) instead of its own colours */
  logoTint?: boolean;
}

export interface Jersey {
  group: any;
  /** top of the torso in the group's space — where a hanger hooks on */
  top: number;
  /** where the display form's floor is, in the group's space (draped models carry it) */
  formBase?: number;
  /** with a hanger: where a rail passes through the hook (group units); absent for the wire hanger */
  hookTop?: number;
  hookZ?: number;
  /** has sleeves (the display form shows arms for these) */
  sleeved?: boolean;
  /** long sleeves, draped hanging at the sides: shown on the form without its (held-out) arms */
  longSleeves?: boolean;
  /** where the prints go, and which display form it is draped on (shorts: the hip form) */
  layout?: PrintLayout;
  setLook(look: JerseyLook): void;
  dispose(): void;
}

/**
 * "top" a shirt; "hoodie" the back print sits below the hood; "shorts" a number low on
 * the leg; "pants" track pants — a small logo and number high on the thigh
 */
export type PrintLayout = "top" | "hoodie" | "shorts" | "pants";

/** torso width the print sizes were set against; other widths scale to keep real size */
const REF_WIDTH = 2.6;

const PATTERN_INDEX: Record<PatternId, number> = { none: 0, diagonal: 1, chest: 2, side: 3, pin: 4, hoops: 5 };

const lin = (THREE: any, hex: string) => new THREE.Color(hex).convertSRGBToLinear();

/** a soft hex-dot weave used as the bump map for the mesh fabric */
function weaveTexture(THREE: any) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#808080";
  x.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 16; r++)
    for (let col = 0; col < 16; col++) {
      const ox = (r % 2) * 4;
      x.fillStyle = "#3a3a3a";
      x.beginPath();
      x.arc(col * 8 + ox + 2, r * 8 + 4, 1.9, 0, Math.PI * 2);
      x.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 9);
  return t;
}

/**
 * ExtrudeGeometry caps a shape with a handful of huge triangles; once the
 * torso is puffed those show up as facet lines. Split every triangle until no
 * edge is longer than `maxLen`, then weld shared corners so normals smooth.
 */
function tessellate(THREE: any, geo: any, maxLen: number) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const P = src.attributes.position.array as Float32Array;
  const U = src.attributes.uv?.array as Float32Array | undefined;
  const outP: number[] = [];
  const outU: number[] = [];
  const max2 = maxLen * maxLen;
  type V = [number, number, number, number, number];
  const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (a[3] + b[3]) / 2, (a[4] + b[4]) / 2];
  const d2 = (a: V, b: V) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const split = (a: V, b: V, c: V, depth: number) => {
    const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
    const m = Math.max(ab, bc, ca);
    if (m <= max2 || depth > 12) {
      for (const v of [a, b, c]) { outP.push(v[0], v[1], v[2]); outU.push(v[3], v[4]); }
      return;
    }
    if (m === ab) { const n = mid(a, b); split(a, n, c, depth + 1); split(n, b, c, depth + 1); }
    else if (m === bc) { const n = mid(b, c); split(a, b, n, depth + 1); split(a, n, c, depth + 1); }
    else { const n = mid(c, a); split(a, b, n, depth + 1); split(n, b, c, depth + 1); }
  };
  for (let i = 0; i < P.length / 3; i += 3) {
    const v = (k: number): V => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2], U ? U[k * 2] : 0, U ? U[k * 2 + 1] : 0];
    split(v(i), v(i + 1), v(i + 2), 0);
  }
  // weld by position so neighbouring triangles share one smoothed normal
  const keyOf = (i: number) => `${Math.round(outP[i * 3] * 1e4)},${Math.round(outP[i * 3 + 1] * 1e4)},${Math.round(outP[i * 3 + 2] * 1e4)}`;
  const map = new Map<string, number>();
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < outP.length / 3; i++) {
    const k = keyOf(i);
    let idx = map.get(k);
    if (idx === undefined) {
      idx = pos.length / 3;
      map.set(k, idx);
      pos.push(outP[i * 3], outP[i * 3 + 1], outP[i * 3 + 2]);
      uv.push(outU[i * 2], outU[i * 2 + 1]);
    }
    index.push(idx);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(index);
  if (src !== geo) src.dispose();
  geo.dispose();
  return out;
}

// one shared load: every jersey on the page awaits the same promise
let logoLoad: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  if (!logoLoad) {
    logoLoad = new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => { logoLoad = null; res(null); };
      img.src = "/models/axiom-logo-white.png";
    });
  }
  return logoLoad;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function imageOf(src: string): Promise<HTMLImageElement | null> {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => { imageCache.delete(src); res(null); };
      img.src = src;
    }));
  }
  return imageCache.get(src)!;
}

/** draws `img` fitted inside a box centred on (cx, cy), optionally as a one-colour print */
function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, box: number, tint: string | null) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = box / Math.max(w0, h0);
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  if (!tint) { ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); return; }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = tint;
  x.fillRect(0, 0, w, h);
  ctx.drawImage(c, cx - w / 2, cy - h / 2);
}

async function fontsReady(family: string) {
  try {
    await (document as any).fonts?.load(`700 120px "${family}"`, "AXIOM 0123456789 กขค");
  } catch {
    /* no Font Loading API — draw with whatever is there */
  }
}

interface Dims { W: number; top: number; hem: number; nw: number; /** chest marks' distance from the centre, as a share of W */ cx?: number; layout?: PrintLayout }

/**
 * The Body's paint: one material that draws the body colour, the pattern, the
 * hem band and the name/number, plus the canvases the name/number live on.
 * `bb` is the torso's bounding box — the name/number canvases span it.
 */
function createSkin(THREE: any, keep: <T>(o: T) => T, dims: Dims, bb: any, TS: number, rest = false) {
  const { W, top, hem, nw } = dims;
  // ---------- name / number canvases ----------
  const mkCanvas = () => { const c = document.createElement("canvas"); c.width = c.height = TS; return c; };
  const frontCanvas = mkCanvas();
  const backCanvas = mkCanvas();
  const frontTex = keep(new THREE.CanvasTexture(frontCanvas));
  const backTex = keep(new THREE.CanvasTexture(backCanvas));
  // premultiplied, so filtering a coloured print against the transparent canvas
  // doesn't darken its edges (the shader divides the alpha back out)
  frontTex.premultiplyAlpha = true;
  backTex.premultiplyAlpha = true;

  // ---------- torso material: body + pattern + hem + text in one pass ----------
  const uniforms = {
    uBody: { value: lin(THREE, "#ffffff") },
    uStripe: { value: lin(THREE, "#000000") },
    uTrim: { value: lin(THREE, "#000000") },
    uNum: { value: lin(THREE, "#000000") },
    uPattern: { value: 0 },
    uHemOn: { value: 0 },
    uHem: { value: hem },
    uW: { value: W },
    uTop: { value: top },
    uBox: { value: new THREE.Vector4(bb.min.x, bb.min.y, bb.max.x - bb.min.x, bb.max.y - bb.min.y) },
    uFront: { value: frontTex },
    uBack: { value: backTex },
    uNeckD: { value: 0.3 },
    uNeckB: { value: 0.07 },
    uNw: { value: nw },
    uV: { value: 0 },
  };
  const torsoMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }));
  torsoMat.onBeforeCompile = (shader: any) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
#ifdef USE_REST
attribute vec3 _rest;
attribute vec3 _restn;
#endif`,
      )
      // a garment draped on the display form is printed in its flat-pattern
      // coordinates (_rest), so the artwork lands as it does on the hanger
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_REST
vObj = _rest; vObjN = _restn;
#else
vObj = position; vObjN = normal;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
uniform vec3 uBody; uniform vec3 uStripe; uniform vec3 uTrim; uniform vec3 uNum;
uniform float uPattern; uniform float uHemOn; uniform float uHem; uniform float uW; uniform float uTop;
uniform vec4 uBox; uniform sampler2D uFront; uniform sampler2D uBack;
uniform float uNeckD; uniform float uNeckB; uniform float uNw; uniform float uV;
float band(float v, float a, float b) { float e = 0.012; return smoothstep(a - e, a + e, v) * (1.0 - smoothstep(b - e, b + e, v)); }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec3 col = uBody;
float x = vObj.x; float y = vObj.y;
float m = 0.0;
if (uPattern > 0.5 && uPattern < 1.5) { float d = y + x * 0.42; m = band(d, -0.05, 0.38); }
else if (uPattern > 1.5 && uPattern < 2.5) { m = band(y, uTop - 1.28, uTop - 0.88); }
else if (uPattern > 2.5 && uPattern < 3.5) { m = smoothstep(uW * 0.74, uW * 0.76, abs(x)); }
else if (uPattern > 3.5 && uPattern < 4.5) { m = step(fract(x * 3.2 + 0.25), 0.16); }
else if (uPattern > 4.5) { m = step(fract(y * 1.35 + 0.1), 0.42); }
col = mix(col, uStripe, m);
float hemLine = uHem - 0.05 + 0.13 * (x / uW) * (x / uW);
col = mix(col, uTrim, uHemOn * (1.0 - smoothstep(hemLine + 0.15, hemLine + 0.17, y)));
vec2 uv = vec2((x - uBox.x) / uBox.z, (y - uBox.y) / uBox.w);
float front = smoothstep(0.1, 0.35, vObjN.z);
float back = smoothstep(0.1, 0.35, -vObjN.z);
// the print canvases carry real colour: the name/number in the number colour, a team
// logo in its own colours (or one colour). Canvas colours are sRGB.
vec4 inkF = texture2D(uFront, uv) * front;
vec4 inkB = texture2D(uBack, vec2(1.0 - uv.x, uv.y)) * back;
vec4 inkS = inkF + inkB;
float ink = inkS.a;
vec3 inkCol = pow(clamp(inkS.rgb / max(inkS.a, 1e-4), 0.0, 1.0), vec3(2.2));
// print sits on the outer face only. The Blender models have real fabric
// thickness, so an inner layer faces inwards (normal toward the centre); it
// shows through the openings and reads darker.
float outside = vObjN.z * vObj.z >= 0.0 ? 1.0 : 0.0;
col = mix(col, inkCol, clamp(ink, 0.0, 1.0) * outside);
col *= mix(0.55, 1.0, outside);
float ax = abs(x);
float k = clamp(ax / uNw, 0.0, 1.0);
float edgeF = uV > 0.5 ? uTop - uNeckD * (1.0 - k) : uTop - uNeckD * sqrt(max(0.0, 1.0 - k * k));
float edgeB = uTop - uNeckB * sqrt(max(0.0, 1.0 - k * k));
float inside = step(ax, uNw) * (vObjN.z > -0.5 ? step(edgeF, y) : step(edgeB, y));
col = mix(col, vec3(0.008), inside);
vec4 diffuseColor = vec4( col, opacity );`,
      );
  };
  if (rest) torsoMat.defines = { ...(torsoMat.defines ?? {}), USE_REST: "" };
  torsoMat.customProgramCacheKey = () => (rest ? "axiom-torso-v5-rest" : "axiom-torso-v5");


  // ---------- name / number ----------
  let drawToken = 0;
  async function drawText(look: JerseyLook) {
    const token = ++drawToken;
    const fam = look.fontFamily || (FONTS.find(f => f.id === look.font)?.family ?? "Anton");
    await fontsReady(fam);
    const img = look.logo === null ? null : look.logo ? await imageOf(look.logo) : await logo();
    if (token !== drawToken) return; // a newer look already started drawing
    const ink = look.colors.number;
    // the Axiom mark is always a one-colour print; a team logo keeps its colours unless asked
    const tint = !look.logo ? ink : look.logoTint ? ink : null;

    const toPx = (x: number, y: number) => [((x - bb.min.x) / (bb.max.x - bb.min.x)) * TS, (1 - (y - bb.min.y) / (bb.max.y - bb.min.y)) * TS];
    const weight = look.fontFamily ? "400" : look.font === "block" ? "400" : "800";
    const layout = dims.layout ?? "top";

    if (layout === "shorts") {
      // shorts: the logo low on the wearer's right leg, the number on the left; nothing behind
      const f = frontCanvas.getContext("2d")!;
      f.clearRect(0, 0, TS, TS);
      f.fillStyle = ink;
      f.textAlign = "center";
      f.textBaseline = "middle";
      const scale = REF_WIDTH / (bb.max.x - bb.min.x);
      const y = hem + 0.8;
      if (img) {
        const [lx, ly] = toPx(-W * 0.5, y);
        drawLogo(f, img, lx, ly, TS * (look.logo ? 0.13 : 0.1) * scale, tint);
      }
      if (look.number) {
        const [nx, ny] = toPx(W * 0.5, y);
        f.font = `${weight} ${Math.round(TS * 0.11 * scale)}px "${fam}", sans-serif`;
        f.fillText(look.number, nx, ny);
      }
      frontTex.needsUpdate = true;
      backCanvas.getContext("2d")!.clearRect(0, 0, TS, TS);
      backTex.needsUpdate = true;
      return;
    }
    // a hoodie's hood lies over the shoulders: its back print goes lower
    const nameY = layout === "hoodie" ? top - 1.6 : top - 0.55;
    const numY = layout === "hoodie" ? top - 2.05 : top - 1.35;

    // front: logo on the wearer's right chest, small number on the left
    const f = frontCanvas.getContext("2d")!;
    f.clearRect(0, 0, TS, TS);
    f.fillStyle = ink;
    f.textAlign = "center";
    f.textBaseline = "middle";
    const CX = dims.cx ?? 0.44; // singlets: closer in, clear of the armhole band
    const [lx, ly] = toPx(-W * CX, top - 0.78);
    if (img) {
      // a team logo gets a little more room than the Axiom mark: crests are usually wide
      const sz = TS * (look.logo ? 0.15 : 0.12) * (REF_WIDTH / (bb.max.x - bb.min.x));
      drawLogo(f, img, lx, ly, sz, tint);
    }
    if (look.number) {
      const [nx, ny] = toPx(W * CX, top - 0.8);
      f.font = `${weight} ${Math.round(TS * 0.12 * (REF_WIDTH / (bb.max.x - bb.min.x)))}px "${fam}", sans-serif`;
      f.fillText(look.number, nx, ny);
    }
    frontTex.needsUpdate = true;

    // back: name across the shoulders, big number below
    const scale = REF_WIDTH / (bb.max.x - bb.min.x); // same print size on wide and narrow cuts
    const b = backCanvas.getContext("2d")!;
    b.clearRect(0, 0, TS, TS);
    b.fillStyle = ink;
    b.textAlign = "center";
    b.textBaseline = "middle";
    if (look.name) {
      const [bx, by] = toPx(0, nameY);
      let size = TS * 0.075 * scale;
      b.font = `${weight} ${Math.round(size)}px "${fam}", sans-serif`;
      const max = ((W * 1.15) / (bb.max.x - bb.min.x)) * TS;
      const wName = b.measureText(look.name).width;
      if (wName > max) { size *= max / wName; b.font = `${weight} ${Math.round(size)}px "${fam}", sans-serif`; }
      (b as any).letterSpacing = `${Math.round(size * 0.08)}px`;
      b.fillText(look.name, bx, by);
      (b as any).letterSpacing = "0px";
    }
    if (look.number) {
      const [bx, by] = toPx(0, numY);
      b.font = `${weight} ${Math.round(TS * 0.3 * scale)}px "${fam}", sans-serif`;
      b.fillText(look.number, bx, by);
    }
    backTex.needsUpdate = true;
  }

  function paint(look: JerseyLook, hemInShader: boolean) {
    const c = look.colors;
    uniforms.uBody.value.copy(lin(THREE, c.body));
    uniforms.uStripe.value.copy(lin(THREE, c.stripe));
    uniforms.uTrim.value.copy(lin(THREE, c.trim));
    uniforms.uNum.value.copy(lin(THREE, c.number));
    uniforms.uPattern.value = PATTERN_INDEX[look.pattern] ?? 0;
    uniforms.uHemOn.value = hemInShader && trimEdges(look.trim).hem ? 1 : 0;
    void drawText(look);
  }

  return { uniforms, material: torsoMat, paint, cancel: () => { drawToken++; } };
}

/** fabric feel: mesh gets the weave bump, B1 is soft matte, C1 a tighter sheen */
/**
 * An elastic waistband's gathers: soft ridges running down the band, where the fabric
 * is bunched onto the elastic. A bump map across the band's pattern u (metres).
 */
function gatherTexture(THREE: any) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 4;
  const x = c.getContext("2d")!;
  for (let i = 0; i < 64; i++) {
    // uneven ridges, as real gathers are: two waves of different width
    const v = 0.5 + 0.32 * Math.sin((i / 64) * Math.PI * 2 * 3) + 0.18 * Math.sin((i / 64) * Math.PI * 2 * 5 + 1.3);
    const g = Math.round(255 * Math.min(1, Math.max(0, v)));
    x.fillStyle = `rgb(${g},${g},${g})`;
    x.fillRect(i, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 1); // u runs once round the waist (≈ 0.95 m): ≈ 2 cm between ridges
  return t;
}

function applyFabric(mats: any[], fabric: FabricId, weave: any) {
  const rough = fabric === "mesh" ? 0.88 : fabric === "B1" ? 0.78 : 0.6;
  for (const m of mats) {
    m.roughness = rough;
    m.bumpMap = fabric === "mesh" ? weave : null;
    m.bumpScale = 0.012;
    m.needsUpdate = true;
  }
}

/**
 * A shaped wooden hanger with a chrome hook, for shirts draped on the display form
 * (platform/scripts/blender/build_kits_v3.py). Its top follows the form's shoulder
 * line, so it sits inside the shirt exactly where the form's shoulders were.
 * Built in metres in the form's space; `formBase` places it in the jersey's units.
 * Returns where a rail goes through the hook, in the jersey's units.
 */
function addFormHanger(THREE: any, group: any, keep: <T>(o: T) => T, formBase: number, half: number) {
  const S = 0.26, J = 1.25, ZN = J + 0.335; // kit unit in metres; the form's height marks
  const root = new THREE.Group();
  root.scale.setScalar(1 / S);
  root.position.y = formBase;
  group.add(root);
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.38, metalness: 0 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xdfe2e5, metalness: 1, roughness: 0.16 }));

  // the form's shoulder line: (half-width, height of the top surface)
  const line: [number, number][] = [[0, ZN], [0.06, ZN], [0.124, J + 0.315], [0.172, J + 0.285], [0.205, J + 0.245]];
  const topAt = (x: number) => {
    const a = Math.abs(x);
    for (let i = 1; i < line.length; i++) {
      if (a <= line[i][0]) {
        const [x0, y0] = line[i - 1], [x1, y1] = line[i];
        const t = (a - x0) / (x1 - x0);
        const e = t * t * (3 - 2 * t);
        return y0 + (y1 - y0) * (0.5 * t + 0.5 * e);
      }
    }
    return line[line.length - 1][1];
  };
  // the bar: a rounded section, slim at the neck, broad pads at the shoulders
  const N = 96, M = 20, tipR = 0.014;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -half + (2 * half * i) / N;
    const t = Math.abs(x) / half;
    let h = 0.015 + 0.009 * t * t;
    let d = 0.013 + 0.034 * Math.pow(t, 2.6);
    const over = Math.abs(x) - (half - tipR);
    if (over > 0) { const k = Math.sqrt(Math.max(0, 1 - (over / tipR) ** 2)); h *= k; d *= k; }
    const yc = topAt(x) - 0.0035 - h / 2;
    for (let j = 0; j < M; j++) {
      const a = (2 * Math.PI * j) / M;
      const sy = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55);
      const sz = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55);
      pos.push(x, yc + (sy * h) / 2, (sz * d) / 2);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
    idx.push(a, c, b, b, c, d);
  }
  const barGeo = keep(new THREE.BufferGeometry());
  barGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  barGeo.setIndex(idx);
  barGeo.computeVertexNormals();
  const bar = new THREE.Mesh(barGeo, wood);
  bar.castShadow = true;
  root.add(bar);

  // chrome ferrule, neck and hook (the hook curls toward the back, across a rail)
  const barTop = ZN - 0.0035;
  const ferrule = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0065, 0.0075, 0.012, 20)), chrome);
  ferrule.position.y = barTop + 0.004;
  root.add(ferrule);
  const y1 = barTop + 0.05, r = 0.022;
  const c = new THREE.Vector3(0, y1 + 0.018, -r);
  const pts = [new THREE.Vector3(0, barTop, 0), new THREE.Vector3(0, y1, 0), new THREE.Vector3(0, y1 + 0.018, 0)];
  for (let k = 1; k <= 24; k++) {
    const phi = ((Math.PI + 0.9) * k) / 24;
    pts.push(new THREE.Vector3(0, c.y + Math.sin(phi) * r, c.z + Math.cos(phi) * r));
  }
  const hook = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.0034, 10, false)), chrome);
  hook.castShadow = true;
  root.add(hook);
  const tip = new THREE.Mesh(keep(new THREE.SphereGeometry(0.0042, 12, 8)), chrome);
  tip.position.copy(pts[pts.length - 1]);
  root.add(tip);
  return { hookTop: formBase + c.y / S, hookZ: c.z / S };
}

/**
 * A clip hanger for shorts: a chrome bar with two clips gripping the waistband at the
 * sides, and a hook. `top` is the waist line, `half` the waist's half-width (group units).
 * Returns where a rail goes through the hook.
 */
function addClipHanger(THREE: any, group: any, keep: <T>(o: T) => T, top: number, half: number) {
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xdfe2e5, metalness: 1, roughness: 0.16 }));
  const plastic = keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.45, metalness: 0.1 }));
  const barY = top + 0.42;
  const L = half * 2 + 0.36;
  const bar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.032, 0.032, L, 18)), chrome);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = barY;
  group.add(bar);
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(keep(new THREE.SphereGeometry(0.04, 14, 10)), chrome);
    end.position.set((sx * L) / 2, barY, 0);
    group.add(end);
    // a sliding clip: a collar on the bar, a short stem, and the two jaws round the waistband
    const x = sx * half * 0.96;
    const collar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16)), plastic);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(x, barY, 0);
    group.add(collar);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.014, barY - top - 0.17, 10)), chrome);
    stem.position.set(x, (barY + top + 0.17) / 2, 0);
    group.add(stem);
    for (const sz of [-1, 1]) {
      const jaw = new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.24, 0.035)), plastic);
      jaw.position.set(x, top + 0.04, sz * 0.075);
      jaw.rotation.x = sz * 0.08;
      jaw.castShadow = true;
      group.add(jaw);
    }
    const spring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.045, 0.01, 8, 18)), chrome);
    spring.rotation.y = Math.PI / 2;
    spring.position.set(x, top + 0.15, 0);
    group.add(spring);
  }
  // the hook, curling toward the back across a rail
  const r = 0.085;
  const y1 = barY + 0.22;
  const c = new THREE.Vector3(0, y1 + 0.07, -r);
  const pts = [new THREE.Vector3(0, barY, 0), new THREE.Vector3(0, y1, 0), new THREE.Vector3(0, y1 + 0.07, 0)];
  for (let k = 1; k <= 24; k++) {
    const phi = ((Math.PI + 0.9) * k) / 24;
    pts.push(new THREE.Vector3(0, c.y + Math.sin(phi) * r, c.z + Math.cos(phi) * r));
  }
  const hook = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.013, 10, false)), chrome);
  hook.castShadow = true;
  group.add(hook);
  return { hookTop: c.y, hookZ: c.z };
}

/** a wire hanger hooked over the shoulders; `sh` = half-width at the shoulders */
function addHanger(THREE: any, group: any, keep: <T>(o: T) => T, top: number, sh: number, drop: number) {
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.35 }));
  const bar = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-sh, top - drop, 0),
    new THREE.Vector3(-sh * 0.45, top + 0.08, 0),
    new THREE.Vector3(0, top + 0.36, 0),
    new THREE.Vector3(sh * 0.45, top + 0.08, 0),
    new THREE.Vector3(sh, top - drop, 0),
  ]);
  group.add(new THREE.Mesh(keep(new THREE.TubeGeometry(bar, 60, 0.028, 8, false)), metal));
  const hook = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.026, 8, 30, Math.PI * 1.4)), metal);
  hook.position.set(0.0, top + 0.62, 0);
  hook.rotation.z = -Math.PI * 0.2;
  group.add(hook);
  const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8)), metal);
  stem.position.set(0, top + 0.42, 0);
  group.add(stem);
}

export function buildJersey(THREE: any, cut: KitCut, opts: { hanger?: boolean; textureSize?: number } = {}): Jersey {
  const group = new THREE.Group();
  const disposables: any[] = [];
  const keep = <T,>(o: T) => { disposables.push(o); return o; };

  const W = 1.12 * cut.fit;
  const top = 1.45 * cut.length;
  const hem = -1.55 * cut.length;
  const nw = cut.neck === "polo" ? 0.4 : 0.42;
  const sleeved = cut.sleeves !== "none";
  const armpitY = top - (sleeved ? 0.95 : 1.08);

  // ---------- torso silhouette ----------
  const s = new THREE.Shape();
  s.moveTo(-nw, top);
  s.quadraticCurveTo(0, top - 0.24, nw, top);
  if (sleeved) {
    s.lineTo(W * 0.97, top - 0.3);
    s.quadraticCurveTo(W * 1.02, top - 0.62, W, armpitY);
  } else {
    s.lineTo(nw + 0.3, top - 0.04);
    s.bezierCurveTo(nw + 0.3, top - 0.55, W * 0.84, armpitY + 0.2, W, armpitY);
  }
  s.bezierCurveTo(W * 0.96, armpitY - 0.8, W * 1.04, hem + 0.9, W * 1.05, hem + 0.06);
  s.quadraticCurveTo(0, hem - 0.14, -W * 1.05, hem + 0.06);
  s.bezierCurveTo(-W * 1.04, hem + 0.9, -W * 0.96, armpitY - 0.8, -W, armpitY);
  if (sleeved) {
    s.quadraticCurveTo(-W * 1.02, top - 0.62, -W * 0.97, top - 0.3);
  } else {
    s.bezierCurveTo(-W * 0.84, armpitY + 0.2, -nw - 0.3, top - 0.55, -nw - 0.3, top - 0.04);
  }
  s.lineTo(-nw, top);

  const D = 0.4;
  const extruded = new THREE.ExtrudeGeometry(s, {
    depth: D, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.12, bevelSegments: 6, steps: 1, curveSegments: 28,
  });
  extruded.translate(0, 0, -D / 2);
  const torsoGeo = keep(tessellate(THREE, extruded, 0.09));
  // puff both faces: full at the centre line, thin at the side seams
  const pos = torsoGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const across = Math.cos(Math.min(Math.abs(x) / (W * 1.08), 1) * (Math.PI / 2));
    const chest = 1 + 0.12 * Math.exp(-((y - (top - 0.9)) ** 2) / 0.5);
    pos.setZ(i, z * (0.55 + 0.95 * across) * chest);
  }
  torsoGeo.computeVertexNormals();
  torsoGeo.computeBoundingBox();
  const bb = torsoGeo.boundingBox;

  const skin = createSkin(THREE, keep, { W, top, hem, nw }, bb, opts.textureSize ?? 1024);
  const { uniforms, material: torsoMat } = skin;
  const weave = keep(weaveTexture(THREE));

  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.castShadow = true;
  group.add(torso);

  // ---------- sleeves + cuffs ----------
  const sleeveMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }));
  const armTrimMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  const neckTrimMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));

  if (sleeved) {
    const len = 0.95;
    const sleeveGeo = keep(new THREE.CylinderGeometry(0.4, 0.31, len, 40, 4, false));
    const cuffGeo = keep(new THREE.CylinderGeometry(0.322, 0.322, 0.11, 40, 1, true));
    const theta = 0.62; // below horizontal
    for (const side of [1, -1]) {
      const dir = new THREE.Vector3(side * Math.cos(theta), -Math.sin(theta), 0);
      const joint = new THREE.Vector3(side * W * 0.84, top - 0.52, 0);
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      // the cylinder's +Y end is the wide one; turn it to face the shoulder (-dir)
      sleeve.rotation.z = side === 1 ? Math.PI / 2 - theta : -(Math.PI / 2 - theta);
      sleeve.scale.set(1, 1, 0.6);
      sleeve.position.copy(joint).addScaledVector(dir, len / 2);
      sleeve.castShadow = true;
      group.add(sleeve);
      const cuff = new THREE.Mesh(cuffGeo, armTrimMat);
      cuff.rotation.z = sleeve.rotation.z;
      cuff.scale.set(1, 1, 0.6);
      cuff.position.copy(joint).addScaledVector(dir, len - 0.05);
      group.add(cuff);
    }
  } else {
    // armhole trim follows the silhouette edge, front to back
    const tubeR = 0.05;
    for (const side of [1, -1]) {
      const pts = [];
      const strapX = nw + 0.3, strapY = top - 0.04;
      const curve = new THREE.CubicBezierCurve(
        new THREE.Vector2(strapX, strapY),
        new THREE.Vector2(strapX, top - 0.55),
        new THREE.Vector2(W * 0.84, armpitY + 0.2),
        new THREE.Vector2(W, armpitY),
      );
      for (let i = 0; i <= 24; i++) {
        const p = curve.getPoint(i / 24);
        pts.push(new THREE.Vector3(side * (p.x + 0.035), p.y, 0));
      }
      const path = new THREE.CatmullRomCurve3(pts);
      group.add(new THREE.Mesh(keep(new THREE.TubeGeometry(path, 48, tubeR, 10, false)), armTrimMat));
    }
  }

  // ---------- neck ----------
  // The collar has to ride on the real surface, which the puffing above made
  // curved, so each point is found by casting a ray at the torso.
  torso.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const surfaceZ = (x: number, y: number, face: 1 | -1) => {
    ray.set(new THREE.Vector3(x, y, face * 5), new THREE.Vector3(0, 0, -face));
    const hit = ray.intersectObject(torso, false)[0];
    return hit ? hit.point.z : 0;
  };
  const neckD = cut.neck === "v" ? 0.72 : cut.neck === "polo" ? 0.24 : 0.3;
  const neckBackD = 0.07;
  const edgeFront = (ax: number) =>
    cut.neck === "v" ? top - neckD * (1 - ax / nw) : top - neckD * Math.sqrt(Math.max(0, 1 - (ax / nw) ** 2));
  const edgeBack = (ax: number) => top - neckBackD * Math.sqrt(Math.max(0, 1 - (ax / nw) ** 2));
  uniforms.uNeckD.value = neckD;
  uniforms.uNeckB.value = neckBackD;
  uniforms.uNw.value = nw;
  uniforms.uV.value = cut.neck === "v" ? 1 : 0;

  const neckPts: any[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const x = (-1 + (2 * i) / N) * nw * 0.985;
    const y = edgeFront(Math.abs(x));
    neckPts.push(new THREE.Vector3(x, y, surfaceZ(x, y - 0.015, 1) + 0.012));
  }
  for (let i = N - 1; i >= 1; i--) {
    const x = (-1 + (2 * i) / N) * nw * 0.985;
    const y = edgeBack(Math.abs(x));
    neckPts.push(new THREE.Vector3(x, y, surfaceZ(x, y - 0.015, -1) - 0.012));
  }
  const neckCurve = new THREE.CatmullRomCurve3(neckPts, true, "centripetal");
  const neckR = cut.neck === "polo" ? 0.075 : 0.05;
  group.add(new THREE.Mesh(keep(new THREE.TubeGeometry(neckCurve, 120, neckR, 10, true)), neckTrimMat));

  if (cut.neck === "polo") {
    // collar flaps + button placket
    const flapGeo = keep(new THREE.BoxGeometry(0.4, 0.24, 0.035));
    for (const side of [1, -1]) {
      const fx = side * 0.22, fy = top - 0.2;
      const flap = new THREE.Mesh(flapGeo, neckTrimMat);
      flap.position.set(fx, fy, surfaceZ(fx, fy, 1) + 0.04);
      flap.rotation.set(-0.3, 0, side * -0.5);
      group.add(flap);
    }
    const py = top - 0.55;
    const placket = new THREE.Mesh(keep(new THREE.BoxGeometry(0.15, 0.6, 0.025)), neckTrimMat);
    placket.position.set(0, py, surfaceZ(0, py, 1) + 0.005);
    placket.rotation.x = -0.1;
    group.add(placket);
    const btnGeo = keep(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16));
    const btnMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.4 }));
    for (const dy of [0.38, 0.62]) {
      const b = new THREE.Mesh(btnGeo, btnMat);
      b.rotation.x = Math.PI / 2;
      b.position.set(0, top - dy, surfaceZ(0, top - dy, 1) + 0.025);
      group.add(b);
    }
  }

  if (opts.hanger) addHanger(THREE, group, keep, top, sleeved ? W * 0.9 : nw + 0.32, sleeved ? 0.3 : 0.06);

  function setLook(look: JerseyLook) {
    const c = look.colors;
    const edges = trimEdges(look.trim);
    skin.paint(look, true);
    sleeveMat.color.copy(lin(THREE, c.sleeve));
    neckTrimMat.color.copy(lin(THREE, edges.neck ? c.trim : c.body));
    armTrimMat.color.copy(lin(THREE, edges.arm ? c.trim : sleeved ? c.sleeve : c.body));
    applyFabric([torsoMat, sleeveMat], look.fabric, weave);
  }

  return {
    group,
    top,
    setLook,
    dispose() {
      skin.cancel();
      for (const d of disposables) d.dispose?.();
    },
  };
}

/**
 * A jersey from a Blender export. Parts are found by material name; the
 * measurements (top, hem, W, nw) come from the glTF extras on the model.
 */
export function buildJerseyFromModel(THREE: any, root: any, opts: { hanger?: boolean; textureSize?: number } = {}): Jersey {
  const group = new THREE.Group();
  const disposables: any[] = [];
  const keep = <T,>(o: T) => { disposables.push(o); return o; };
  group.add(root);

  let info: any = null;
  root.traverse((o: any) => { if (!info && o.userData && typeof o.userData.top === "number") info = o.userData; });
  if (!info) throw new Error("model has no measurements");
  const layout: PrintLayout = ["hoodie", "shorts", "pants"].includes(info.layout) ? info.layout : "top";
  const dims: Dims = { W: info.W, top: info.top, hem: info.hem, nw: info.nw, layout };
  const sleeved = info.sleeves === "short" || info.sleeves === "long";

  const byName: Record<string, any[]> = {};
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    keep(o.geometry);
    // Blender adds .001 suffixes when several garments share a file
    const name = String(o.material?.name ?? "").replace(/\.\d+$/, "");
    (byName[name] ??= []).push(o);
    keep(o.material);
  });
  const body = byName.Body ?? [];
  if (!body.length) throw new Error("model has no Body material");

  // the name/number canvases span the torso (Body) only — measured in the
  // flat-pattern space when the garment is draped on the form
  const rest = body.every(m => m.geometry.attributes._rest);
  const bb = new THREE.Box3();
  for (const m of body) {
    if (rest) bb.union(new THREE.Box3().setFromBufferAttribute(m.geometry.attributes._rest));
    else { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); }
  }

  const skin = createSkin(THREE, keep, { ...dims, nw: -1, cx: sleeved ? 0.44 : 0.33 }, bb, opts.textureSize ?? 1024, rest); // nw -1: the neck is a real opening
  // a side stripe on shorts is narrower than on a shirt (the stripe starts at 0.75 of uW)
  if (layout === "shorts") skin.uniforms.uW.value = dims.W * 1.18;
  const weave = keep(weaveTexture(THREE));
  const plain = () => keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }));
  // Lining (the inside of the fabric) keeps the dark colour it was exported with
  const mats: Record<string, any> = {
    Sleeve: plain(), Trim_Neck: plain(), Trim_Arm: plain(), Trim_Hem: plain(),
    Waistband: plain(), Hood: plain(), Pocket: plain(), Cord: plain(),
  };
  for (const m of body) m.material = skin.material;
  for (const [name, mat] of Object.entries(mats)) for (const m of byName[name] ?? []) m.material = mat;
  // an elastic waistband is gathered (shorts, track pants): ridges down the band
  if (layout === "shorts" || layout === "pants") {
    mats.Waistband.bumpMap = keep(gatherTexture(THREE));
    mats.Waistband.bumpScale = 0.025;
    mats.Waistband.roughness = 0.9;
  }

  let hook: { hookTop: number; hookZ: number } | undefined;
  if (opts.hanger) {
    if (layout === "shorts") {
      hook = addClipHanger(THREE, group, keep, dims.top, dims.W * 0.56);
    } else if (typeof info.formBase === "number") {
      // draped on the form: a shaped hanger that fits the shoulders (narrower for singlet straps)
      hook = addFormHanger(THREE, group, keep, info.formBase, sleeved ? 0.19 : 0.145);
    } else {
      addHanger(THREE, group, keep, dims.top, sleeved ? dims.W * 0.9 : dims.nw + 0.32, sleeved ? 0.3 : 0.06);
    }
  }

  return {
    group,
    top: dims.top,
    formBase: typeof info.formBase === "number" ? info.formBase : undefined,
    hookTop: hook?.hookTop,
    hookZ: hook?.hookZ,
    sleeved,
    longSleeves: info.sleeves === "long",
    layout,
    setLook(look: JerseyLook) {
      const c = look.colors;
      const edges = trimEdges(look.trim);
      skin.paint(look, false); // the hem has its own material on the model
      mats.Sleeve.color.copy(lin(THREE, c.sleeve));
      mats.Trim_Neck.color.copy(lin(THREE, edges.neck ? c.trim : c.body));
      mats.Trim_Arm.color.copy(lin(THREE, edges.arm ? c.trim : sleeved ? c.sleeve : c.body));
      mats.Trim_Hem.color.copy(lin(THREE, edges.hem ? c.trim : c.body));
      mats.Waistband.color.copy(lin(THREE, edges.neck ? c.trim : c.body)); // shorts / track pants
      mats.Hood.color.copy(lin(THREE, c.body)); // hoodie
      mats.Pocket.color.copy(lin(THREE, c.body));
      mats.Cord.color.copy(lin(THREE, c.trim));
      applyFabric([skin.material, mats.Sleeve], look.fabric, weave);
    },
    dispose() {
      skin.cancel();
      for (const d of disposables) d.dispose?.();
    },
  };
}

const modelCache = new Map<string, Promise<ArrayBuffer>>();

/**
 * The kit's Blender model if it loads, otherwise the code-built jersey.
 * The file is fetched once per page and parsed per use, so every scene gets
 * its own materials to colour.
 */
export async function loadJersey(
  THREE: any,
  kit: { id: string; cut: KitCut },
  opts: { hanger?: boolean; textureSize?: number } = {},
): Promise<Jersey> {
  const url = `/models/kits/${kit.id}.glb`;
  try {
    if (!THREE.GLTFLoader) throw new Error("GLTFLoader not loaded");
    let buf = modelCache.get(url);
    if (!buf) {
      buf = fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); });
      modelCache.set(url, buf);
      buf.catch(() => modelCache.delete(url));
    }
    const data = await buf;
    const gltf: any = await new Promise((res, rej) => new THREE.GLTFLoader().parse(data, "/models/kits/", res, rej));
    return buildJerseyFromModel(THREE, gltf.scene, opts);
  } catch {
    return buildJersey(THREE, kit.cut, opts);
  }
}
