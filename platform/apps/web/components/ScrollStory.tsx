"use client";

import { useEffect, useRef, useState } from "react";
import { tri, type Lang } from "../lib/i18n";
import { apiFetch } from "../lib/api";
import Link from "next/link";
import { loadThreeWithGltf, loadThreePost, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey, type Jersey, type JerseyLook } from "../lib/jersey3d";
import { KITS, defaultConfig, type Kit } from "../lib/kits";
import KitThumb from "./KitThumb";

/**
 * The landing page as a walk through the Axiom factory floor at dusk,
 * rendered live in Three.js and driven by scroll. One continuous camera path;
 * every chapter is a composed shot in the same hall:
 *
 *   0 the door  — between two rails of finished shirts, the AXIOM sign at the far end of the hall
 *   1 cut       — over the print table in the middle of the floor the kit changes cut and colour
 *   2 print     — from above, a sheet of fabric runs under the roller and takes the print
 *   3 roster    — the shirt turns; a name types itself, the number counts up
 *   4 team      — the whole team, dressed, rises in the QC bay
 *   5 work      — wide over the sewing lines: real work from the factory, as editorial cards
 *   6 call      — high under the roof trusses, the call to action
 *
 * Lint drifts through the light under the high-bay lamps, dusk comes in
 * through the window band, the sewing lines run either side of the aisle.
 * Text is plain DOM over the canvas, revealed word by word for the active
 * chapter. Reduced motion keeps the whole read without the drift and the
 * eased camera.
 */

const CHAPTERS = 8;
/**
 * Scroll position → the production timeline the 3D props run on. Chapter 2
 * (the collection, at the racks of finished kit) is a side trip: the props
 * hold still while the camera visits the racks, then carry on.
 */
const timeline = (p: number) => (p < 1.5 ? p : p < 2.5 ? 1.5 : p - 1);
const CONTACT_EMAIL = "techkairos241@gmail.com";
const CONTACT_LINE = "@axiomsiam";
const ORDER = ["pacer", "rim", "smash", "club", "striker"]; // the cut chapter ends on football
const STORY_KITS = ORDER.map(id => KITS.find(k => k.id === id)!).filter(Boolean);
const HERO = STORY_KITS[STORY_KITS.length - 1];
const NAME = "SOMCHAI";
const KIT_Y = 2.3; // where the floating kit hangs at the centre spot
const KIT_SCALE = 0.62;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const easeIO = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 0 → 1 → 0 across chapter c, with soft shoulders */
const bell = (p: number, c: number, w = 0.32) => ease((p - (c - w - 0.12)) / 0.12) * (1 - ease((p - (c + w)) / 0.12));
const lookFor = (k: Kit, extra: Partial<JerseyLook> = {}): JerseyLook => {
  const c = defaultConfig(k);
  return { colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: "", number: c.number, font: c.font, ...extra };
};

/**
 * Stations on the factory floor that double as the site menu: pins that sit on
 * the real thing in the 3D hall and open the page for it. They show in the
 * opening shot at the door and again in the view from the roof.
 */
const SPOTS: { href: string; th: string; en: string; ja: string; subTh: string; subEn: string; subJa: string; at: [number, number, number] }[] = [
  { href: "/shop", th: "ออกแบบเสื้อ", en: "Design a kit", ja: "ユニフォームをデザイン", subTh: "เลือกทรง เปลี่ยนสี ใส่ชื่อ", subEn: "Cut, colours, names", subJa: "型・色・名前を選ぶ", at: [2.3, 1.8, 15] },
  { href: "/design", th: "ออกแบบขั้นสูง", en: "Advanced designer", ja: "詳細デザインエディタ", subTh: "วางลายเองทุกจุด", subEn: "Lay out every panel", subJa: "すべてのパーツを自由に配置", at: [0, 1.5, 0.3] },
  { href: "/templates", th: "ตลาดลาย", en: "Template market", ja: "テンプレートマーケット", subTh: "ลายจากดีไซเนอร์", subEn: "Designs from designers", subJa: "デザイナーの柄", at: [10, 3.6, -9] },
  { href: "/tracking", th: "ติดตามออเดอร์", en: "Track my order", ja: "注文を追跡", subTh: "สถานะการผลิตและจัดส่ง", subEn: "Production & delivery", subJa: "生産と配送の状況", at: [9.5, 1.6, -2] },
];

const WORK = [
  { img: "/portfolio/ex_01.png", t: "ωμον · YUTA", th: "เสื้อกลับด้าน · คาโม่ส้ม", en: "Reversible bib · orange camo", ja: "リバーシブルビブス · オレンジ迷彩" },
  { img: "/portfolio/ex_02.png", t: "ωμον · YUTA", th: "เสื้อกลับด้าน · คาโม่ฟ้า", en: "Reversible bib · blue camo", ja: "リバーシブルビブス · ブルー迷彩" },
  { img: "/portfolio/ex_03.png", t: "SEIJO High School", th: "เสื้อวิ่ง (ซิงเกล็ต)", en: "Running singlet", ja: "ランニングシングレット" },
  { img: "/portfolio/ex_04.png", t: "MEIWA FC · ZEN", th: "เสื้อกลับด้าน · ฟุตบอล", en: "Reversible bib · football", ja: "リバーシブルビブス · サッカー" },
];

/** splits a heading into words that rise in one after another when the panel is active; *word = accent */
export function Words({ text }: { text: string }) {
  let n = 0;
  return (
    <>
      {text.split("\n").map((line, li) => {
        const ws = line.split(" ");
        return (
          <span key={li} className="ln">
            {ws.map((w, wi) => {
              const i = n++;
              const cut = w.indexOf("*");
              const pre = cut < 0 ? w : w.slice(0, cut);
              const acc = cut < 0 ? "" : w.slice(cut + 1);
              return (
                <span key={wi}>
                  <span className="wm">
                    <span className="w" style={{ ["--d" as any]: `${i * 70}ms` }}>
                      {pre}{acc && <span className="acc">{acc}</span>}
                    </span>
                  </span>
                  {wi < ws.length - 1 ? " " : null}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

export default function ScrollStory({ lang }: { lang: Lang }) {
  const th = lang === "th";
  const L = tri(lang);
  const root = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const kitLabel = useRef<HTMLSpanElement>(null);
  const kitSub = useRef<HTMLSpanElement>(null);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const spots = useRef<(HTMLAnchorElement | null)[]>([]);
  const [flat, setFlat] = useState(false);
  const [flatKit, setFlatKit] = useState(STORY_KITS.length - 1);
  const [fromPrice, setFromPrice] = useState<number | null>(null);
  const [garmentDelta, setGarmentDelta] = useState<Record<string, number>>({});
  useEffect(() => {
    apiFetch<{ tiers: { minQty: number; price: number }[]; garment?: Record<string, number> }>("/orders/price-table")
      .then(t => {
        if (t.tiers?.length) setFromPrice(Math.min(...t.tiers.map(x => x.price)));
        if (t.garment) setGarmentDelta(t.garment);
      })
      .catch(() => {});
  }, []);
  const thRef = useRef(th);
  thRef.current = th;
  const langRef = useRef(lang);
  langRef.current = lang;

  // scroll → chapter panels (runs with or without WebGL)
  useEffect(() => {
    const still = prefersReducedMotion();
    let shown = 0;
    let raf = 0;
    let lastKit = -1;
    let lastActive = -1;
    const read = () => {
      const el = root.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span > 0 ? clamp01(-r.top / span) * (CHAPTERS - 1) : 0;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const target = read();
      shown += (target - shown) * (still ? 1 : 0.085);
      if (Math.abs(target - shown) < 0.0005) shown = target;
      const p = shown;
      (window as any).__axStory = p;
      let active = 0;
      panels.current.forEach((el, i) => {
        if (!el) return;
        const a = i === 0 ? 1 - ease((p - 0.5) / 0.25) : i === CHAPTERS - 1 ? ease((p - (i - 0.45)) / 0.25) : bell(p, i);
        el.style.opacity = a.toFixed(3);
        el.style.filter = a > 0.98 ? "none" : `blur(${((1 - a) * 10).toFixed(1)}px)`;
        el.style.visibility = a < 0.01 ? "hidden" : "visible";
        if (a > 0.6) active = i;
        el.toggleAttribute("data-on", a > 0.35);
      });
      if (active !== lastActive) {
        lastActive = active;
        dots.current.forEach((d, i) => d?.setAttribute("aria-current", i === active ? "step" : "false"));
        if (counter.current) counter.current.textContent = String(active + 1).padStart(2, "0");
      }
      if (topRef.current) topRef.current.style.opacity = (1 - ease(p / 0.4)).toFixed(3);
      if (bar.current) bar.current.style.transform = `scaleY(${(p / (CHAPTERS - 1)).toFixed(3)})`;
      const ki = Math.min(STORY_KITS.length - 1, Math.max(0, Math.floor(clamp01(timeline(p) - 0.7) * STORY_KITS.length * 0.999)));
      if (ki !== lastKit) {
        lastKit = ki;
        const k = STORY_KITS[ki];
        if (kitLabel.current) kitLabel.current.textContent = thRef.current ? k.name : k.en;
        if (kitSub.current) { const l = langRef.current; kitSub.current.textContent = `${k.code} · ${l === "th" ? k.cutLabel : l === "ja" ? k.cutJa : k.cutEn}`; }
        setFlatKit(ki);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the factory
  useEffect(() => {
    if (!hasWebGL()) { setFlat(true); return; }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    loadThreeWithGltf().then(async (THREE: any) => {
      // only the hero kit is needed to start; the other cuts (≈1 MB each) load later
      const [heroJersey, post] = await Promise.all([loadJersey(THREE, HERO), loadThreePost()]);
      if (disposed || !mount.current) { heroJersey.dispose(); return; }
      const jerseys: (Jersey | null)[] = STORY_KITS.map(k => (k === HERO ? heroJersey : null));
      const el = mount.current;
      const still = prefersReducedMotion();
      const small = Math.min(window.innerWidth, window.innerHeight) < 600;
      const trash: any[] = [];
      const keep = <T,>(o: T) => { trash.push(o); return o; };

      const renderer = new THREE.WebGLRenderer({ antialias: !post, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.6));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0a0a);
      scene.fog = new THREE.FogExp2(0x14110f, 0.016);
      const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 400);

      // The hall: x −18…18, z −14…24, roof 12 m. A mid-size sewing hall, not a
      // hangar. The kit hangs over the centre of the floor; the camera walks in
      // down the central aisle.
      const HALL = { x: 18, z0: -14, z1: 24, h: 12 };
      const HW = HALL.x * 2, HD = HALL.z1 - HALL.z0, HZ = (HALL.z0 + HALL.z1) / 2;
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      // the simple block-out of the hall; swapped for the modelled props once factory_kit.glb arrives
      const simple = new THREE.Group();
      scene.add(simple);
      const inst = (geo: any, mat: any, n: number, place: (i: number, d: any) => void, color?: (i: number) => any, stays = false) => {
        const m = new THREE.InstancedMesh(geo, mat, n);
        for (let i = 0; i < n; i++) {
          dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
          place(i, dummy);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
          if (color) m.setColorAt(i, color(i));
        }
        m.castShadow = true; m.receiveShadow = true;
        (stays ? scene : simple).add(m);
        trash.push(m);
        return m;
      };

      // ---------- floor: polished concrete, joints, yellow walkway lines ----------
      const floorTex = keep(canvasTex(THREE, 2048, 2048, x => {
        const S = 2048, m = S / 60;
        x.fillStyle = "#3a3b3d"; x.fillRect(0, 0, S, S);
        for (let i = 0; i < 26000; i++) {
          const v = 40 + Math.random() * 40;
          x.fillStyle = `rgba(${v},${v},${v + 2},${0.18 + Math.random() * 0.2})`;
          x.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 3);
        }
        // big soft stains, the floor is worked on
        for (let i = 0; i < 40; i++) {
          const g = x.createRadialGradient(0, 0, 0, 0, 0, 40 + Math.random() * 160);
          g.addColorStop(0, "rgba(20,20,22,.22)"); g.addColorStop(1, "rgba(20,20,22,0)");
          x.save(); x.translate(Math.random() * S, Math.random() * S); x.fillStyle = g; x.fillRect(-200, -200, 400, 400); x.restore();
        }
        x.strokeStyle = "rgba(15,15,16,.55)"; x.lineWidth = 2;
        for (let k = 0; k <= 60; k += 5) { x.beginPath(); x.moveTo(k * m, 0); x.lineTo(k * m, S); x.stroke(); x.beginPath(); x.moveTo(0, k * m); x.lineTo(S, k * m); x.stroke(); }
        const P = (wx: number, wz: number) => [(wx + 30) * m, (wz + 24) * m] as const;
        // the central aisle
        x.strokeStyle = "#d9a81e"; x.lineWidth = 0.12 * m;
        for (const sx of [-5.5, 5.5]) { const [a, b] = P(sx, HALL.z0 + 2), [, d] = P(sx, HALL.z1); x.beginPath(); x.moveTo(a, b); x.lineTo(a, d); x.stroke(); }
        // the QC bay in the middle: hatched border
        const [qx, qz] = P(-4, -3.5), qw = 8 * m, qh = 7 * m;
        x.strokeRect(qx, qz, qw, qh);
        x.save(); x.beginPath(); x.rect(qx - 0.5 * m, qz - 0.5 * m, qw + m, qh + m); x.rect(qx, qz, qw, qh); x.clip("evenodd");
        x.lineWidth = 0.18 * m;
        for (let k = -qh; k < qw + qh; k += 0.7 * m) { x.beginPath(); x.moveTo(qx + k, qz - m); x.lineTo(qx + k + qh + 2 * m, qz + qh + m); x.stroke(); }
        x.restore();
        x.fillStyle = "rgba(217,168,30,.85)"; x.font = `700 ${0.7 * m}px sans-serif`; x.textAlign = "left";
        x.fillText("QC · 04", qx + 0.3 * m, qz + qh - 0.3 * m);
      }));
      floorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.08 })));
      floor.rotation.x = -Math.PI / 2;
      floor.position.z = 6;
      floor.receiveShadow = true;
      scene.add(floor);

      // ---------- walls, the window band, the sign ----------
      const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 }));
      const wallGeo = keep(new THREE.PlaneGeometry(1, 1));
      const wall = (w: number, h: number, px: number, py: number, pz: number, ry: number) => {
        const m = new THREE.Mesh(wallGeo, wallMat);
        m.scale.set(w, h, 1); m.position.set(px, py, pz); m.rotation.y = ry; m.receiveShadow = true;
        scene.add(m);
      };
      wall(HW, HALL.h, 0, HALL.h / 2, HALL.z0, 0);
      wall(HW, HALL.h, 0, HALL.h / 2, HALL.z1, Math.PI);
      wall(HD, HALL.h, -HALL.x, HALL.h / 2, HZ, Math.PI / 2);
      wall(HD, HALL.h, HALL.x, HALL.h / 2, HZ, -Math.PI / 2);
      const ceil = new THREE.Mesh(wallGeo, keep(new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 1 })));
      ceil.scale.set(HW, HD, 1); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HALL.h, HZ);
      scene.add(ceil);
      // dusk through the high windows: a long band of panes along the back and side walls
      const winTex = keep(canvasTex(THREE, 1024, 128, x => {
        const g = x.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#2a3550"); g.addColorStop(0.55, "#d0662c"); g.addColorStop(1, "#ffb066");
        x.fillStyle = g; x.fillRect(0, 0, 1024, 128);
        x.fillStyle = "#0c0c0d";
        for (let i = 0; i <= 1024; i += 64) x.fillRect(i - 3, 0, 6, 128);
        x.fillRect(0, 60, 1024, 5); x.fillRect(0, 0, 1024, 5); x.fillRect(0, 123, 1024, 5);
      }));
      winTex.wrapS = THREE.RepeatWrapping;
      const winMat = keep(new THREE.MeshBasicMaterial({ map: winTex, fog: false }));
      const band = (w: number, px: number, pz: number, ry: number, rep: number) => {
        const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); trash.push(t);
        const m = new THREE.Mesh(wallGeo, rep === 1 ? winMat : keep(new THREE.MeshBasicMaterial({ map: t, fog: false })));
        m.scale.set(w, 2.2, 1); m.position.set(px, HALL.h - 2.4, pz); m.rotation.y = ry;
        scene.add(m);
      };
      band(HW - 4, 0, HALL.z0 + 0.05, 0, 1);
      band(HD - 4, -HALL.x + 0.05, HZ, Math.PI / 2, 1);
      band(HD - 4, HALL.x - 0.05, HZ, -Math.PI / 2, 1);
      // the sign over the far end of the hall
      try { await (document as any).fonts?.load?.('400 100px "Anton"'); } catch { /* use whatever loaded */ }
      const signTex = keep(canvasTex(THREE, 2048, 640, x => {
        x.fillStyle = "#f2f0eb";
        x.font = '400 430px "Anton", "Impact", sans-serif';
        x.textAlign = "center"; x.textBaseline = "alphabetic";
        x.fillText("AXIOM", 1024, 450);
        x.fillStyle = "#f26522"; x.fillRect(560, 500, 928, 14);
        x.fillStyle = "#c9c6bf";
        x.font = '500 64px "Noto Sans Thai", sans-serif';
        x.fillText("SIAM SPORTSWEAR FACTORY", 1024, 610);
      }));
      const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(9.8, 3.08)), keep(new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthTest: false, fog: false, color: 0xd8d6d0 })));
      sign.position.set(10.4, 6.2, HALL.z0 + 0.1);
      sign.renderOrder = 10; // the hero shot's sign reads over the steel in front of it
      scene.add(sign);

      // ---------- steel: columns and roof trusses ----------
      const steel = keep(new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.7, roughness: 0.45 }));
      const colXs = [-HALL.x + 0.3, -7.5, 7.5, HALL.x - 0.3];
      const colZs = [-8, 2, 12, 22];
      inst(keep(new THREE.BoxGeometry(0.45, HALL.h, 0.45)), steel, colXs.length * colZs.length, (i, d) => {
        d.position.set(colXs[i % colXs.length], HALL.h / 2, colZs[Math.floor(i / colXs.length)]);
      });
      inst(keep(new THREE.BoxGeometry(HW, 0.5, 0.3)), steel, colZs.length, (i, d) => d.position.set(0, HALL.h - 1.2, colZs[i]));
      inst(keep(new THREE.BoxGeometry(0.25, 0.25, HD)), steel, 6, (i, d) => d.position.set(-15 + i * 6, HALL.h - 1.6, HZ));

      // ---------- pendant high-bay lamps (the light of the hall) ----------
      const lampXs = [-11, -3.5, 3.5, 11];
      const lampZs = [-10, -3, 4, 11, 18];
      const lamps: [number, number][] = [];
      lampXs.forEach(lx => lampZs.forEach(lz => lamps.push([lx, lz])));
      const LAMP_Y = 8.6;
      inst(keep(new THREE.CylinderGeometry(0.22, 0.75, 0.55, 20, 1, true)), keep(new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })), lamps.length, (i, d) => d.position.set(lamps[i][0], LAMP_Y + 0.28, lamps[i][1]));
      const bulbs = inst(keep(new THREE.CircleGeometry(0.62, 20)), keep(new THREE.MeshBasicMaterial({ color: 0xfff1dc })), lamps.length, (i, d) => { d.position.set(lamps[i][0], LAMP_Y + 0.02, lamps[i][1]); d.rotation.x = Math.PI / 2; });
      bulbs.castShadow = false;
      inst(keep(new THREE.CylinderGeometry(0.015, 0.015, HALL.h - LAMP_Y, 4)), steel, lamps.length, (i, d) => d.position.set(lamps[i][0], (HALL.h + LAMP_Y) / 2, lamps[i][1]), undefined, true);
      // soft light cones under the aisle lamps, like the god-rays in the reference
      const beamMat = keep(new THREE.ShaderMaterial({
        uniforms: { uA: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN, vV)), 1.8); float h = smoothstep(0.0, 1.0, vUv.y); gl_FragColor = vec4(1.0, 0.9, 0.75, 0.07 * rim * h * uA); }",
      }));
      const beamGeo = keep(new THREE.CylinderGeometry(0.6, 3.4, LAMP_Y, 28, 1, true));
      beamGeo.translate(0, -LAMP_Y / 2, 0);
      lamps.filter(([lx]) => Math.abs(lx) < 5).forEach(([lx, lz]) => {
        const b = new THREE.Mesh(beamGeo, beamMat);
        b.position.set(lx, LAMP_Y, lz);
        scene.add(b);
      });
      scene.add(new THREE.HemisphereLight(0xf3e6d4, 0x1a1714, 0.42));
      const target = new THREE.Object3D();
      scene.add(target);
      // a few real lights carry the shadows; the rest of the lamps are glow
      [[-3.5, 4, 1.3], [3.5, -3, 1.0], [-3.5, 18, 1.0], [11, 4, 0.8], [-11, 4, 0.8]].forEach(([lx, lz, k], i) => {
        const s = new THREE.SpotLight(0xffe9cc, k, 34, 0.95, 0.7, 1.4);
        s.position.set(lx, LAMP_Y, lz);
        const tg = new THREE.Object3D(); tg.position.set(lx, 0, lz); scene.add(tg);
        s.target = tg;
        if (i === 0) {
          s.castShadow = true;
          s.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
          s.shadow.camera.near = 2; s.shadow.camera.far = 20;
          s.shadow.bias = -0.0005;
        }
        scene.add(s);
      });
      // a tight key light that follows the product
      const key = new THREE.SpotLight(0xffffff, 1.5, 30, 0.42, 0.6, 1.2);
      key.position.set(4, 9, 9);
      const keyTarget = new THREE.Object3D();
      scene.add(keyTarget);
      key.target = keyTarget;
      scene.add(key);
      const rim = new THREE.PointLight(0xff7a3a, 1.2, 18, 2);
      rim.position.set(-4, 4, -4);
      scene.add(rim);

      // ---------- the sewing lines either side of the aisle ----------
      const lineXs = [-12.5, -9.5, 9.5, 12.5];
      const lineZs = [-10, -6, -2, 2, 6, 10, 14, 18];
      const SEATS = lineXs.length * lineZs.length;
      const seat = (i: number) => [lineXs[i % lineXs.length], lineZs[Math.floor(i / lineXs.length)]] as const;
      inst(keep(new THREE.BoxGeometry(1.9, 0.06, 1.0)), keep(new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.7 })), SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx, 0.78, sz); });
      inst(keep(new THREE.BoxGeometry(1.8, 0.74, 0.06)), keep(new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.8 })), SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx, 0.38, sz - 0.42); });
      // the machine: a body, an arm and a head
      const machMat = keep(new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.45, metalness: 0.1 }));
      inst(keep(new THREE.BoxGeometry(0.6, 0.16, 0.26)), machMat, SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx, 0.89, sz); });
      inst(keep(new THREE.BoxGeometry(0.12, 0.32, 0.2)), machMat, SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx + 0.22, 1.1, sz); });
      inst(keep(new THREE.BoxGeometry(0.56, 0.12, 0.2)), machMat, SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx, 1.28, sz); });
      // fabric under the needle, every bench a different job
      const JOB = [0xf26522, 0x2f6fd6, 0xe23b3b, 0xf2f0eb, 0x1d1f23, 0xf5c518, 0x2aa96b];
      inst(keep(new THREE.BoxGeometry(0.7, 0.012, 0.6)), keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })), SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx - 0.35, 0.82, sz + 0.12); d.rotation.y = (i % 5 - 2) * 0.12; }, i => col.setHex(JOB[(i * 7 + 3) % JOB.length]));
      // the task lamp over each bench
      const task = inst(keep(new THREE.SphereGeometry(0.05, 8, 6)), keep(new THREE.MeshBasicMaterial({ color: 0xffd9a8 })), SEATS, (i, d) => { const [sx, sz] = seat(i); d.position.set(sx + 0.6, 1.45, sz - 0.3); });
      task.castShadow = false;

      // ---------- fabric rolls racked along the left wall ----------
      const ROLL_COLORS = [0xf26522, 0x2f6fd6, 0xe23b3b, 0xf2f0eb, 0x1d1f23, 0xf5c518, 0x2aa96b, 0x7c4dff, 0x0e3a7a];
      const BAYS = Math.floor((HD - 4) / 2.4);
      const ROLLS = 5 * BAYS;
      inst(keep(new THREE.CylinderGeometry(0.28, 0.28, 1.7, 18)), keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })), ROLLS, (i, d) => {
        const r = i % 5, c = Math.floor(i / 5);
        d.position.set(-HALL.x + 1.4 + (r % 2) * 0.1, 0.4 + r * 0.62, HALL.z0 + 2 + c * 2.4);
        d.rotation.z = Math.PI / 2;
      }, i => col.setHex(ROLL_COLORS[(i * 5 + Math.floor(i / 5)) % ROLL_COLORS.length]));
      inst(keep(new THREE.BoxGeometry(2.2, 3.4, 0.08)), steel, BAYS, (i, d) => d.position.set(-HALL.x + 1.4, 1.7, HALL.z0 + 0.8 + i * 2.4));

      // ---------- finished shirts on rails along the right wall, and one rack at the door ----------
      const shirtGeo = keep(new THREE.BoxGeometry(0.62, 0.78, 0.035));
      const shirtMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
      const RAIL = Math.floor((HD - 8) / 1.2);
      const HANG = 2 * RAIL;
      inst(shirtGeo, shirtMat, HANG, (i, d) => {
        const r = i % 2, k = Math.floor(i / 2);
        d.position.set(HALL.x - 2.2 - r * 0.9, 1.55, HALL.z0 + 6 + k * 1.2 + r * 0.6);
        d.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.25;
      }, i => col.setHex(JOB[Math.floor(i / 12) % JOB.length]));
      inst(keep(new THREE.CylinderGeometry(0.02, 0.02, HD - 8, 6)), steel, 2, (i, d) => { d.position.set(HALL.x - 2.2 - i * 0.9, 2.0, HZ + 2); d.rotation.x = Math.PI / 2; });
      // the foreground: two rails of shirts by the door, cut-outs facing the lens
      const teeTex = keep(canvasTex(THREE, 256, 256, x => {
        x.fillStyle = "#fff";
        x.beginPath();
        x.moveTo(98, 22); x.quadraticCurveTo(128, 46, 158, 22);
        x.lineTo(214, 46); x.lineTo(246, 104); x.lineTo(206, 124); x.lineTo(192, 98);
        x.lineTo(194, 246); x.lineTo(62, 246); x.lineTo(64, 98); x.lineTo(50, 124); x.lineTo(10, 104); x.lineTo(42, 46);
        x.closePath(); x.fill();
        x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(64, 98, 130, 6);
      }));
      const teeMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: teeTex, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }));
      const FORE = 2 * 9;
      inst(keep(new THREE.PlaneGeometry(1.0, 1.0)), teeMat, FORE, (i, d) => {
        const side = i < 9 ? -1 : 1, k = i % 9;
        d.position.set(side * (1.9 + k * 0.4), 1.62, 15.2 - k * 0.12);
        d.rotation.y = -side * (0.35 + k * 0.03);
        d.rotation.z = (Math.random() - 0.5) * 0.06;
      }, i => col.setHex(JOB[(i * 3 + 1) % JOB.length]));
      inst(keep(new THREE.CylinderGeometry(0.02, 0.02, 4.2, 6)), steel, 2, (i, d) => { d.position.set((i ? 1 : -1) * 3.6, 2.17, 14.75); d.rotation.z = Math.PI / 2; d.rotation.y = (i ? 1 : -1) * 0.12; });

      // ---------- lint in the light ----------
      const MOTES = small ? 900 : 2200;
      const moteGeo = keep(new THREE.BufferGeometry());
      const mp = new Float32Array(MOTES * 3);
      for (let i = 0; i < MOTES; i++) { mp[i * 3] = (Math.random() - 0.5) * 22; mp[i * 3 + 1] = Math.random() * 9; mp[i * 3 + 2] = HALL.z0 + 4 + Math.random() * (HD - 6); }
      moteGeo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
      const moteMat = keep(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime; uniform float uPx; varying float vA;
          void main(){ vec3 p = position;
            p.y = mod(p.y + uTime * 0.12 + sin(uTime * 0.3 + position.x) * 0.3, 9.0);
            p.x += sin(uTime * 0.21 + position.z * 0.7) * 0.5; p.z += cos(uTime * 0.17 + position.x) * 0.4;
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            vA = smoothstep(0.0, 1.0, p.y) * smoothstep(9.0, 7.0, p.y) * smoothstep(40.0, 4.0, -mv.z);
            gl_PointSize = uPx * 38.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.88, 0.7, (1.0 - d * 2.0) * 0.6 * vA); }`,
      }));
      const motes = new THREE.Points(moteGeo, moteMat);
      motes.frustumCulled = false;
      scene.add(motes);

      // ---------- the print table and the heat press at the centre ----------
      const printTable = new THREE.Group();
      const tableTop = new THREE.Mesh(keep(new THREE.BoxGeometry(3.8, 0.1, 2.5)), keep(new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.5, metalness: 0.3 })));
      tableTop.position.y = 0.78; tableTop.receiveShadow = true; tableTop.castShadow = true;
      printTable.add(tableTop);
      const legGeo = keep(new THREE.BoxGeometry(0.08, 0.76, 0.08));
      for (const lx of [-1.8, 1.8]) for (const lz of [-1.15, 1.15]) { const leg = new THREE.Mesh(legGeo, steel); leg.position.set(lx, 0.38, lz); printTable.add(leg); }
      const press = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, 1.3, 2.6)), keep(new THREE.MeshStandardMaterial({ color: 0x5d5b58, roughness: 0.6, metalness: 0.2 })));
      press.position.set(2.3, 0.65, 0); press.castShadow = true;
      printTable.add(press);
      const pressStrip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.06, 2.2)), keep(new THREE.MeshBasicMaterial({ color: 0xf26522 })));
      pressStrip.position.set(1.94, 1.05, 0);
      printTable.add(pressStrip);
      printTable.position.set(0, 0, 0.3);
      scene.add(printTable);

      // ---------- the modelled factory (Blender: scripts/blender/factory_kit.py) ----------
      // Each prop comes in at the origin; we instance it everywhere it belongs.
      // Primitives using the "Fabric" material take a colour per instance.
      const kit = new THREE.Group();
      scene.add(kit);
      let kitDone: (p: Record<string, { geo: any; mat: any; local: any }[]> | null) => void = () => {};
      const kitReady = new Promise<Record<string, { geo: any; mat: any; local: any }[]> | null>(r => { kitDone = r; });
      new THREE.GLTFLoader().load("/models/factory/factory_kit.glb", (gltf: any) => {
        if (disposed) return;
        gltf.scene.updateMatrixWorld(true);
        const prims: Record<string, { geo: any; mat: any; local: any }[]> = {};
        gltf.scene.children.forEach((root: any) => {
          const list: { geo: any; mat: any; local: any }[] = [];
          root.traverse((o: any) => {
            if (!o.isMesh) return;
            const m = o.material;
            if (m.name === "Glow") { m.emissiveIntensity = 2.2; m.toneMapped = false; }
            if (m.name === "Screen") m.emissiveIntensity = 1.4;
            if (m.name === "Fabric") m.color.setHex(0xffffff);
            list.push({ geo: o.geometry, mat: m, local: o.matrixWorld.clone() });
            trash.push(o.geometry, m);
          });
          prims[root.name] = list;
        });
        const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
        const M = (x: number, y: number, z: number, ry = 0, s = 1) =>
          new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone().setFromEuler(e.set(0, ry, 0)), s === 1 ? one : new THREE.Vector3(s, s, s));
        const tmpM = new THREE.Matrix4();
        // fabric colours: one material per colour (more dependable than per-instance colour across three versions)
        const tinted = new Map<string, any>();
        const tintMat = (m: any, hex: number) => {
          const k = m.uuid + hex;
          if (!tinted.has(k)) { const c = m.clone(); c.color.setHex(hex).convertSRGBToLinear(); tinted.set(k, c); trash.push(c); }
          return tinted.get(k);
        };
        const put = (name: string, at: any[], tint?: (i: number) => number, shadow = true, into: any = kit) => {
          (prims[name] || []).forEach(({ geo, mat, local }) => {
            const groups = new Map<any, any[]>();
            at.forEach((m4, i) => {
              const m = tint && mat.name === "Fabric" ? tintMat(mat, tint(i)) : mat;
              if (!groups.has(m)) groups.set(m, []);
              groups.get(m)!.push(m4);
            });
            groups.forEach((list, m) => {
              const im = new THREE.InstancedMesh(geo, m, list.length);
              list.forEach((m4: any, i: number) => im.setMatrixAt(i, tmpM.multiplyMatrices(m4, local)));
              im.castShadow = shadow;
              im.receiveShadow = true;
              into.add(im);
            });
          });
        };
        const TINTS = [0xf26522, 0x2f6fd6, 0xe23b3b, 0xf2f0eb, 0x1d1f23, 0xf5c518, 0x2aa96b, 0x7c4dff, 0x0e3a7a, 0xff8fb1];

        // steel
        // the column model is 14 m; squash it to this roof
        const colH = new THREE.Vector3(1, HALL.h / 14, 1);
        put("column", colXs.flatMap(x => colZs.map(z => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, colH))), undefined, false);
        put("truss", colZs.flatMap(z => Array.from({ length: HW / 6 }, (_, k) => M(-HALL.x + 3 + k * 6, HALL.h - 2.7, z))), undefined, false);
        put("highbay", lamps.map(([x, z]) => M(x, LAMP_Y, z)), undefined, false);
        put("wall_fan", [
          ...[-9, 1, 11, 21].map(z => M(-HALL.x + 0.3, 3.4, z, Math.PI / 2)),
          ...[-6, 4, 14].map(z => M(HALL.x - 0.3, 4.6, z, -Math.PI / 2)),
        ], undefined, false);

        // the sewing lines: on the right, packing takes the back and the racks of finished kit the front
        const benches: any[] = [];
        for (let i = 0; i < SEATS; i++) {
          const [sx, sz] = seat(i);
          if (sx > 0 && (sz < -7 || sz > 12)) continue;
          if (small && lineZs.indexOf(sz) % 2) continue;
          benches.push(M(sx, 0, sz, (i % 3 - 1) * 0.03));
        }
        put("sewing_station", benches, i => TINTS[(i * 3 + 1) % TINTS.length]);
        put("work_cloth", benches, i => TINTS[(i * 7 + 3) % TINTS.length], false);

        // fabric store: pallet racking down the left wall, rolls of every colour
        const racks: any[] = [], rolls: any[] = [];
        for (let z = HALL.z0 + 2; z <= HALL.z1 - 2; z += 3) {
          const R = M(-HALL.x + 1.75, 0, z, Math.PI / 2);
          racks.push(R);
          for (let lv = 0; lv < 4; lv++) for (const d of [-0.36, 0, 0.36]) rolls.push(R.clone().multiply(M(0, 0.42 + lv * 0.95, d)));
        }
        put("roll_rack", racks, undefined, false);
        put("fabric_roll", rolls, i => TINTS[(i * 5 + Math.floor(i / 12)) % TINTS.length], false);

        // finished kit: rolling racks down the right wall (packing keeps the back corner), and two across the door in the opening shot
        const gr: any[] = [], tees: any[] = [];
        for (let z = -8; z <= HALL.z1 - 3; z += small ? 4.8 : 3.2) {
          const R = M(HALL.x - 2.7, 0, z, Math.PI / 2);
          gr.push(R);
          for (let k = 0; k < 8; k++) tees.push(R.clone().multiply(M(-0.7 + k * 0.2, 1.78, 0, Math.PI / 2 + (Math.sin(k * 7.3 + z) * 0.12))));
        }
        put("garment_rack", gr, undefined, false);
        put("shirt_hanging", tees, i => TINTS[Math.floor(i / 8) % TINTS.length], false);
        const doorRacks = [M(-2.7, 0, 15.4, 0.12), M(2.7, 0, 15.4, -0.12)];
        const doorTees: any[] = [];
        doorRacks.forEach((R, side) => {
          for (let k = 0; k < 6; k++) doorTees.push(R.clone().multiply(M(-0.75 + k * 0.3, 1.78, 0, (side ? -1 : 1) * (0.55 + k * 0.05))));
        });
        put("garment_rack", doorRacks);
        put("shirt_hanging", doorTees, i => TINTS[(i * 3 + 1) % TINTS.length]);

        // print bay: the cutting table under the roller, the calender behind it
        printTable.children.forEach((c: any) => { c.visible = false; });
        put("cut_table", [M(0, 0, 0)], undefined, true, printTable);
        put("calender", [M(0, 0, -3.6)], i => 0xf26522);

        // packing at the back right, and trolleys in the aisles
        const pal: any[] = [], box: any[] = [];
        [[8.5, -12], [10.5, -12], [12.5, -12], [8.5, -9.2], [10.9, -8.9], [14, -10.6]].forEach(([x, z], n) => {
          const P = M(x, 0, z, n * 0.07);
          pal.push(P);
          const layers = 1 + (n % 3);
          for (let l = 0; l < layers; l++) for (const [bx, bz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) box.push(P.clone().multiply(M(bx, 0.146 + l * 0.4, bz, (l % 2) * Math.PI)));
        });
        put("pallet", pal, undefined, false);
        put("carton", box);
        put("trolley", [M(6.4, 0, 12, 0.3), M(-6.6, 0, -4, -0.4), M(6.6, 0, 17.5, 1.2), M(-8.8, 0, 16, 2.6)], i => TINTS[i * 2 + 1]);

        simple.visible = false;
        kitDone(prims);
      }, undefined, () => { kitDone(null); /* keep the block-out */ });

      // ---------- the kits at the centre spot ----------
      const hero = new THREE.Group();
      scene.add(hero);
      const kitCount = jerseys.length;
      const mount1 = (j: Jersey, i: number) => {
        j.setLook(lookFor(STORY_KITS[i], { number: i === kitCount - 1 ? "" : STORY_KITS[i].defaults.number }));
        j.group.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
        j.group.scale.setScalar(KIT_SCALE);
        j.group.visible = false;
        hero.add(j.group);
      };
      jerseys.forEach((j, i) => { if (j) mount1(j, i); });
      const main = jerseys[kitCount - 1]!;
      let restLoading = false;
      const loadRest = () => {
        if (restLoading) return;
        restLoading = true;
        STORY_KITS.forEach((k, i) => {
          if (jerseys[i]) return;
          loadJersey(THREE, k).then(j => {
            if (disposed) { j.dispose(); return; }
            jerseys[i] = j;
            mount1(j, i);
          }).catch(() => {});
        });
      };
      let mainName = "", mainNumber = "";

      // ---------- the print run ----------
      const printCanvas = document.createElement("canvas");
      printCanvas.width = 1024; printCanvas.height = 640;
      drawPrint(printCanvas, HERO);
      const printTex = keep(new THREE.CanvasTexture(printCanvas));
      const sheetMat = keep(new THREE.ShaderMaterial({
        uniforms: { uMap: { value: printTex }, uP: { value: 0 }, uA: { value: 0 } },
        transparent: true, side: THREE.DoubleSide,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform sampler2D uMap; uniform float uP; uniform float uA; varying vec2 vUv;
          void main(){
            float knit = 0.92 + 0.08 * step(0.5, fract(vUv.x * 180.0)) * step(0.5, fract(vUv.y * 120.0));
            vec3 base = vec3(0.93, 0.92, 0.9) * knit;
            vec3 ink = texture2D(uMap, vUv).rgb * (0.95 + 0.05 * knit);
            float edge = smoothstep(uP - 0.02, uP, vUv.x);
            vec3 col = mix(ink, base, edge);
            col += vec3(1.0, 0.45, 0.15) * smoothstep(0.03, 0.0, abs(vUv.x - uP)) * 0.6;
            gl_FragColor = vec4(col * 0.9, uA);
          }`,
      }));
      const sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.2, 2.0)), sheetMat);
      sheet.rotation.x = -Math.PI / 2;
      scene.add(sheet);
      const rollerMat = keep(new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.85, roughness: 0.3, transparent: true }));
      const roller = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 32)), rollerMat);
      roller.castShadow = true;
      sheet.add(roller);
      roller.position.z = 0.1;

      // ---------- the team ----------
      const team = new THREE.Group();
      team.visible = false;
      scene.add(team);
      let teamLoading = false;
      // the line-up: each kit on a headless display form, the way a kit shop shows it
      const TEAM_SCALE = 0.26, TEAM_Y = 1.25;
      const loadTeam = async () => {
        if (teamLoading) return;
        teamLoading = true;
        const ids = ["pacer", "rim", "striker", "smash", "club"];
        const [prims, kits] = await Promise.all([
          kitReady,
          Promise.all(ids.map(id => loadJersey(THREE, KITS.find(x => x.id === id)!).catch(() => null))),
        ]);
        if (disposed) { kits.forEach(j => j?.dispose()); return; }
        kits.forEach((j, i) => {
          const k = KITS.find(x => x.id === ids[i])!;
          const slot = new THREE.Group();
          slot.position.set((i - 2) * 1.05, 0, -Math.abs(i - 2) * 0.45);
          slot.userData.i = i;
          const stand = new THREE.Group();
          stand.rotation.y = -(i - 2) * 0.16;
          slot.add(stand);
          (((j && (j.sleeved === false || j.longSleeves) && prims?.dress_form_sleeveless?.length) ? prims.dress_form_sleeveless : prims?.dress_form) || []).forEach(({ geo, mat, local }) => {
            const m = new THREE.Mesh(geo, mat);
            m.applyMatrix4(local);
            m.castShadow = true;
            stand.add(m);
          });
          if (j) {
            j.setLook(lookFor(k, { name: "", number: k.defaults.number }));
            j.group.scale.setScalar(TEAM_SCALE);
            // stand the shirt on the form the way it was draped (models carry the form's floor)
            j.group.position.y = typeof j.formBase === "number" ? -j.formBase * TEAM_SCALE : TEAM_Y;
            j.group.traverse((m: any) => { if (m.isMesh) m.castShadow = true; });
            stand.add(j.group);
            jerseys.push(j);
          }
          team.add(slot);
        });
      };
      // the line-up is heavy: desktops load it once idle, phones when the visitor gets close
      const idle = window.setTimeout(() => { if (!small) loadTeam(); }, 2500);

      // ---------- camera path: one composed shot per chapter ----------
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      const CAM = [V(0, 1.6, 20), V(2.6, 2.7, 7.2), V(10.6, 2.7, 23), V(0.6, 5.4, 3.4), V(-1.6, 2.5, 6.4), V(0, 2.3, 7.4), V(-10, 6.2, 13), V(0, 9.2, 19.5)];
      const LOOK = [V(1, 3.9, -14), V(0, KIT_Y - 0.2, 0), V(15, 1.3, 0), V(0, 0.85, 0.3), V(0, KIT_Y, 0), V(0, 0.55, -0.4), V(2, 2.0, -5), V(0, 0, -5)];
      const cam = V(0, 0, 0), look = V(0, 0, 0), tmp = V(0, 0, 0);
      const keyAt = (arr: any[], p: number, out: any) => {
        const i = Math.min(arr.length - 2, Math.floor(p));
        return out.copy(arr[i]).lerp(arr[i + 1], easeIO(p - i));
      };

      // ---------- post: bloom on the lights ----------
      let composer: any = null;
      let bloom: any = null;
      if (post) {
        try {
          composer = new THREE.EffectComposer(renderer);
          composer.addPass(new THREE.RenderPass(scene, camera));
          bloom = new THREE.UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 0.85, 0.55, 0.82);
          composer.addPass(bloom);
          composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
        } catch { composer = null; bloom = null; }
      }

      // ---------- interaction & sizing ----------
      let drag: { x: number; a: number } | null = null;
      let spin = 0;
      let mx = 0, my = 0;
      const onDown = (e: PointerEvent) => { drag = { x: e.clientX, a: spin }; };
      const onMove = (e: PointerEvent) => {
        if (drag) spin = drag.a + (e.clientX - drag.x) * 0.008;
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      const onUp = () => { drag = null; };
      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      renderer.domElement.style.touchAction = "pan-y";

      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        composer?.setSize(w, h);
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? Math.min(66, 38 / Math.max(0.55, w / h)) : 38;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      const onLost = (e: Event) => { e.preventDefault(); setFlat(true); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      let visible = true;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(el);

      // the menu labels: measured size (per language) and how far each is nudged to clear the others
      let spotLang = langRef.current, spotW = 0;
      const spotSize: ({ w: number; h: number } | null)[] = SPOTS.map(() => null);
      const spotDy = SPOTS.map(() => 0);
      const spotFlip: (boolean | null)[] = SPOTS.map(() => null);
      let raf = 0;
      let last = performance.now();
      let t = 0;
      let px = 0, py = 0;
      const loop = (ms: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (ms - last) / 1000);
        last = ms;
        if (!visible || document.hidden) return;
        if (!still) t += dt;
        const P0: number = (window as any).__axStory ?? 0;
        const p = timeline(P0);
        const colAway = bell(P0, 2, 0.3); // the kit steps aside while we're at the racks
        if (p > 2.6) loadTeam();
        const portrait = el.clientWidth < el.clientHeight;

        // camera, with a little pointer parallax
        keyAt(CAM, P0, cam);
        keyAt(LOOK, P0, look);
        if (portrait) {
          cam.x *= 0.35;
          tmp.copy(cam).sub(look).multiplyScalar(p > 0.5 && p < 4.6 && colAway < 0.5 ? 1.35 : 1.1);
          cam.copy(look).add(tmp);
          if (p > 0.5 && p < 4.4 && colAway < 0.5) look.y -= 0.7;
        }
        if (!still) { px += (mx - px) * 0.04; py += (my - py) * 0.04; }
        camera.position.set(cam.x + px * 0.5, cam.y - py * 0.3, cam.z);
        camera.lookAt(look);

        sign.visible = P0 < 1.1 && !portrait;
        printTable.visible = p < 3.6;
        printTable.position.y = -ease((p - 3.3) / 0.3) * 1.2;

        // the kit at the centre spot
        const kitIn = ease((p - 0.35) / 0.5);
        const kitAway = ease((p - 3.5) / 0.35);
        const printAway = bell(p, 2, 0.3);
        const cutP = clamp01(p - 0.7) * STORY_KITS.length;
        const ki = Math.min(STORY_KITS.length - 1, Math.floor(cutP * 0.999));
        const within = cutP - ki;
        // the other cuts load as the visitor nears the cut chapter; until one arrives, the hero stands in
        if (p > 0.3) loadRest();
        const show = p < 0.7 ? kitCount - 1 : jerseys[ki] ? ki : kitCount - 1;
        for (let i = 0; i < kitCount; i++) if (jerseys[i]) jerseys[i]!.group.visible = i === show;
        const flip = p > 0.7 && p < 1.7 && within < 0.14 ? 1 - within / 0.14 : 0;
        hero.position.set(0, KIT_Y - (1 - kitIn) * 3 + (still ? 0 : Math.sin(t * 1.1) * 0.05) - printAway * 1.6 + kitAway * 3, -kitAway * 2);
        const s = (1 - printAway * 0.6) * (0.4 + kitIn * 0.6) * (1 - colAway * 0.7);
        hero.scale.set(s * (1 - flip * 0.92), s, s);
        const backTurn = ease((p - 2.55) / 0.5) * (1 - ease((p - 3.55) / 0.4));
        if (!drag && !still) spin += dt * 0.25;
        hero.rotation.y += (spin + backTurn * Math.PI - hero.rotation.y) * (still ? 1 : 1 - Math.exp(-dt * 6));
        hero.visible = kitIn > 0.01 && kitAway < 0.99 && printAway < 0.8 && colAway < 0.9;
        keyTarget.position.copy(hero.position);

        // the name types itself, the number counts up
        const nameP = clamp01((p - 2.75) / 0.55);
        const name = NAME.slice(0, Math.round(nameP * NAME.length));
        const number = nameP <= 0 ? "" : String(Math.max(1, Math.round(ease(nameP) * 10)));
        if (name !== mainName || number !== mainNumber) {
          mainName = name; mainNumber = number;
          main.setLook(lookFor(HERO, { name, number }));
        }

        // the print run, laid on the table under the press
        const sheetIn = bell(p, 2, 0.34);
        sheetMat.uniforms.uA.value = sheetIn;
        rollerMat.opacity = sheetIn;
        sheet.visible = sheetIn > 0.01;
        sheet.position.set(0, 0.84 + (1 - sheetIn) * 0.6, 0.3);
        const run = clamp01((p - 1.65) / 0.7);
        sheetMat.uniforms.uP.value = ease(run) * 1.02;
        roller.position.x = -1.6 + ease(run) * 3.2;
        roller.rotation.y = -run * 30;

        // the team rises onto the centre circle
        const rise = ease((p - 3.4) / 0.45);
        team.visible = rise > 0.01;
        team.children.forEach((slot: any) => {
          const i = slot.userData.i ?? 0;
          const k = ease((p - 3.4 - Math.abs(i - 2) * 0.08) / 0.4);
          slot.position.y = -(1 - k) * 2.2;
          slot.rotation.y = still ? 0 : Math.sin(t * 0.4 + i) * 0.08;
        });
        key.intensity = 1.5 * (1 - ease((p - 4.5) / 0.6));
        rim.intensity = 1.2 * (1 - ease((p - 4.5) / 0.6));

        moteMat.uniforms.uTime.value = t;
        if (bloom) bloom.strength = 0.85 + ease((p - 4.6) / 0.8) * 0.35;

        if (composer) composer.render(); else renderer.render(scene, camera);

        // the menu pins: project each station onto the screen
        const pinA = Math.max(1 - ease((P0 - 0.25) / 0.3), ease((P0 - (CHAPTERS - 1.55)) / 0.35));
        const W = el.clientWidth, H = el.clientHeight;
        if (spotLang !== langRef.current || spotW !== W) { spotLang = langRef.current; spotW = W; spotSize.fill(null); }
        // the chapter text on screen now (the heading at the door, the call from the roof): pins keep off it
        const textEl = pinA > 0.05 ? panels.current[P0 < 1 ? 0 : CHAPTERS - 1] : null;
        // measured on the words themselves (the panel's box is wider than its text)
        const text: { x0: number; x1: number; top: number; bottom: number }[] = [];
        if (textEl) {
          const o = el.getBoundingClientRect();
          // each word of the heading (its lines are full-width blocks), the paragraph, the buttons
          textEl.querySelectorAll<HTMLElement>(".wm, p, a, button, .ax-kicker").forEach(n => {
            const r = n.getBoundingClientRect();
            if (r.width && r.height) text.push({ x0: r.left - o.left - 10, x1: r.right - o.left + 10, top: r.top - o.top - 8, bottom: r.bottom - o.top + 8 });
          });
        }
        const shown: { i: number; a: HTMLAnchorElement; lbl: HTMLElement; sx: number; sy: number; w: number; h: number }[] = [];
        SPOTS.forEach((sp, i) => {
          const a = spots.current[i];
          if (!a) return;
          tmp.set(sp.at[0], sp.at[1], sp.at[2]).project(camera);
          // keep clear of the chapter text: the heading on the left at the door, the call at the top from the roof
          const clear = P0 < 1 ? tmp.x > -0.2 : tmp.y < 0.16;
          const dx = (tmp.x + 1) / 2 * W, dy = (1 - tmp.y) / 2 * H;
          const onText = text.some(t => dx > t.x0 && dx < t.x1 && dy > t.top && dy < t.bottom);
          const inView = !portrait && clear && !onText && tmp.z < 1 && Math.abs(tmp.x) < 0.96 && Math.abs(tmp.y) < 0.92;
          const op = inView ? pinA : 0;
          a.style.opacity = op.toFixed(3);
          a.style.visibility = op < 0.05 ? "hidden" : "visible";
          const lbl = a.querySelector("span") as HTMLElement | null;
          if (op < 0.05 || !lbl) return;
          const sz = spotSize[i] ?? (spotSize[i] = { w: lbl.offsetWidth, h: lbl.offsetHeight });
          shown.push({ i, a, lbl, sx: dx, sy: dy, w: sz.w, h: sz.h });
        });
        // place the labels so none covers another label or another station's dot: the dot stays
        // on the station, the label tries its usual side, then the other side, then a little up or down
        shown.sort((p1, p2) => p1.sy - p2.sy);
        type Box = { x0: number; x1: number; top: number; bottom: number };
        const placed: Box[] = shown.map(d => ({ x0: d.sx - 13, x1: d.sx + 13, top: d.sy - 13, bottom: d.sy + 13 }));
        // and off the chapter text (the same areas the dots keep clear of)
        const textZone = (b: Box) => text.some(t => b.x0 < t.x1 && b.x1 > t.x0 && b.top < t.bottom && b.bottom > t.top);
        const hits = (b: Box) => b.x0 < 8 || b.x1 > W - 8 || textZone(b) || placed.some(q => b.x0 < q.x1 + 6 && b.x1 > q.x0 - 6 && b.top < q.bottom + 5 && b.bottom > q.top - 5);
        const boxOf = (d: (typeof shown)[number], flip: boolean, dy: number): Box => ({
          x0: flip ? d.sx - 21 - d.w : d.sx + 21, x1: flip ? d.sx - 21 : d.sx + 21 + d.w,
          top: d.sy + dy - d.h / 2, bottom: d.sy + dy + d.h / 2,
        });
        for (const d of shown) {
          const usual = d.sx > W * 0.62; // the side with room
          const first = spotFlip[d.i] ?? usual; // keep last frame's side while it still fits (no flicker)
          const step = d.h * 0.6;
          let pick: { flip: boolean; dy: number } | null = null;
          for (const dy of [0, step, -step, 2 * step, -2 * step]) {
            for (const flip of [first, !first]) {
              if (!hits(boxOf(d, flip, dy))) { pick = { flip, dy }; break; }
            }
            if (pick) break;
          }
          if (!pick) {
            // nothing clear nearby: below whatever it meets
            let dy = 0;
            for (let pass = 0; pass < 8; pass++) {
              const b = boxOf(d, usual, dy);
              const q = placed.find(q => b.x0 < q.x1 + 6 && b.x1 > q.x0 - 6 && b.top < q.bottom + 5 && b.bottom > q.top - 5);
              if (!q) break;
              dy = q.bottom + 5 + d.h / 2 - d.sy;
            }
            pick = { flip: usual, dy };
          }
          placed.push(boxOf(d, pick.flip, pick.dy));
          spotFlip[d.i] = pick.flip;
          d.a.toggleAttribute("data-flip", pick.flip);
          d.a.style.transform = pick.flip
            ? `translate(${(d.sx + 22).toFixed(1)}px, ${d.sy.toFixed(1)}px) translateX(-100%)`
            : `translate(${d.sx.toFixed(1)}px, ${d.sy.toFixed(1)}px)`;
          spotDy[d.i] += (pick.dy - spotDy[d.i]) * (still ? 1 : 0.25);
          d.lbl.style.transform = Math.abs(spotDy[d.i]) < 0.5 ? "" : `translateY(${spotDy[d.i].toFixed(1)}px)`;
        }
        SPOTS.forEach((_, i) => { if (!shown.some(d => d.i === i)) spotFlip[i] = null; });
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        clearTimeout(idle);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        jerseys.forEach(j => j?.dispose());
        trash.forEach(x => x.dispose?.());
        composer?.renderTarget1?.dispose?.();
        composer?.renderTarget2?.dispose?.();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => setFlat(true));

    return () => { disposed = true; cleanup?.(); };
  }, []);

  const go = (i: number) => {
    const el = root.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + (span * i) / (CHAPTERS - 1) + 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const CH = L(
    ["เข้าโรงงาน", "เลือกทรง", "คอลเลกชัน", "พิมพ์ลงผ้า", "ชื่อ-เบอร์", "ทั้งทีม", "ผลงาน", "ติดต่อเรา"],
    ["Factory", "Cut", "Collection", "Print", "Names", "Team", "Work", "Contact"],
    ["工場", "型", "コレクション", "プリント", "名前と番号", "チーム", "実績", "お問い合わせ"],
  );

  const P = (i: number) => (e: HTMLDivElement | null) => { panels.current[i] = e; };

  return (
    <section ref={root} id="story" className="ax-story" style={{ height: `${CHAPTERS * 100}vh` }} aria-label={L("เรื่องราวการผลิตเสื้อทีม", "How a team kit is made", "チームユニフォームができるまで")}>
      {([["collection", 2], ["process", 3], ["work", 6], ["contact", 7]] as const).map(([id, i]) => (
        <span key={id} id={id} className="ax-story-anchor" style={{ top: `calc(${i * 100}vh + 2px)` }} aria-hidden="true" />
      ))}
      <div className="ax-story-pin">
        <div ref={mount} className="ax-story-canvas" role="img" aria-label={L("โรงงานผลิตเสื้อกีฬาแบบ 3D ที่เปลี่ยนไปตามการเลื่อนหน้า", "A 3D walk through the sportswear factory that follows your scroll", "スクロールに合わせて歩く、3Dのスポーツウェア工場")}>
          {flat && (
            <div className="ax-story-flat">
              <KitThumb kit={STORY_KITS[flatKit]} number={STORY_KITS[flatKit].defaults.number} label={STORY_KITS[flatKit].name} />
            </div>
          )}
        </div>
        <div className="ax-story-vignette" aria-hidden="true" />
        {!flat && (
          <nav className="ax-story-spots" aria-label={L("เมนูในโรงงาน", "Factory menu", "工場メニュー")}>
            {SPOTS.map((sp, i) => (
              <Link key={sp.href} href={sp.href} className="ax-spot" ref={e => { spots.current[i] = e; }} style={{ visibility: "hidden" }}>
                <i aria-hidden="true" />
                <span><b>{L(sp.th, sp.en, sp.ja)}</b><small>{L(sp.subTh, sp.subEn, sp.subJa)}</small></span>
              </Link>
            ))}
          </nav>
        )}
        <div className="ax-story-grain" aria-hidden="true" />

        <div ref={topRef} className="ax-story-topline" aria-hidden="true">
          <span className="ax-mono">Axiom Siam · Sportswear factory</span>
          <span className="ax-mono">Bangkok · OEM / ODM</span>
          <span className="ax-story-scroll ax-mono">Scroll</span>
        </div>

        {/* 0 — kick-off */}
        <div ref={P(0)} className="ax-story-panel hero" data-on>
          <div className="lede">
            <span className="ax-kicker">{L("โรงงานผลิตเสื้อกีฬา · ออกแบบเองได้ทั้งทีม", "Custom team kit · made in Bangkok", "オーダーチームウェア · バンコクの自社工場")}</span>
            <h1 className="ax-display"><Words text={"Built for\n*your *team."} /></h1>
            <p>{L("ออกแบบเสื้อทีมบนโมเดล 3D เปลี่ยนสีได้ทีละส่วน ใส่ชื่อและเบอร์ทั้งทีม เห็นราคาทันที แล้วสั่งผลิตกับโรงงานได้ในที่เดียว", "Design your team kit in 3D: recolour every panel, add every player's name and number, see the price straight away and order from the factory.", "3Dモデルでチームユニフォームをデザイン。パーツごとに色を変え、全員の名前と番号を入れて、価格をその場で確認。そのまま工場に発注できます。")}</p>
            <div className="ax-row">
              <Link href="/shop" className="ax-btn solid">{L("เริ่มออกแบบเสื้อ", "Start designing", "デザインを始める")}</Link>
              <button type="button" className="ax-story-link" onClick={() => go(1)}>{L("เดินเข้าโรงงาน", "Walk into the factory", "工場の中へ")} <span aria-hidden="true">↓</span></button>
            </div>
            <nav className="ax-story-chips" aria-label={L("เมนู", "Menu", "メニュー")}>
              {SPOTS.map(sp => <Link key={sp.href} href={sp.href}>{L(sp.th, sp.en, sp.ja)}</Link>)}
            </nav>
          </div>
        </div>

        {/* 1 — cuts */}
        <div ref={P(1)} className="ax-story-panel left">
          <span className="ax-kicker">01 — {L("เลือกทรง", "Pick a cut", "型を選ぶ")}</span>
          <h2 className="ax-display"><span ref={kitLabel}>{th ? HERO.name : HERO.en}</span></h2>
          <span className="rule" />
          <span ref={kitSub} className="ax-mono">{HERO.code} · {L(HERO.cutLabel, HERO.cutEn, HERO.cutJa)}</span>
          <p>{L("ฟุตบอล วิ่ง บาส แบด โปโล แต่ละทรงตัดเย็บมาเพื่อกีฬานั้น แล้วเปลี่ยนสีได้ทุกส่วน", "Football, running, basketball, badminton and polo, each cut for its sport, every panel recolourable.", "サッカー、ランニング、バスケ、バドミントン、ポロ。競技ごとの専用の型で、すべてのパーツの色を変えられます。")}</p>
          <Link href="/shop" className="ax-story-go">{L("เลือกทรงเสื้อ", "Pick a cut", "型を選ぶ")} <span aria-hidden="true">→</span></Link>
        </div>

        {/* 2 — collection, at the racks of finished kit */}
        <div ref={P(2)} className="ax-story-panel collection">
          <div className="head">
            <span className="ax-kicker">02 — {L("คอลเลกชัน", "Collection", "コレクション")}</span>
            <h2 className="ax-display"><Words text={L("เลือก*ทรงตั้งต้น", "Pick a *base", "ベースの*型を選ぶ")} /></h2>
            <p>{L("เลือกทรงตั้งต้นตามกีฬา แล้วไปปรับสี ลาย ชื่อ และเบอร์ต่อในห้องออกแบบ", "Start from a cut made for your sport, then recolour it and add names and numbers in the studio.", "競技に合った型から始めて、スタジオで色を変え、名前と番号を入れましょう。")}</p>
          </div>
          <div className="ax-story-kits">
            {KITS.map(k => (
              <Link key={k.id} href={`/shop?kit=${k.id}`} className="kit">
                <div className="pic" style={{ background: k.theme.bg }}><KitThumb kit={k} number={k.defaults.number} /></div>
                <div className="meta">
                  <span className="ax-mono">{k.code}</span>
                  <b>{th ? k.name : k.en}</b>
                  <small>{L(k.cutLabel, k.cutEn, k.cutJa)}{fromPrice !== null ? ` · ${L("เริ่ม ", "from ", "")}฿${Math.max(0, fromPrice + (garmentDelta[k.garment] ?? 0)).toLocaleString("th-TH")}${lang === "ja" ? "〜" : ""}` : ""}</small>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 3 — print */}
        <div ref={P(3)} className="ax-story-panel left">
          <span className="ax-kicker">03 — {L("พิมพ์ลงเนื้อผ้า", "Printed into the fabric", "生地に染め込むプリント")}</span>
          <h2 className="ax-display"><Words text={L("สีอยู่\nใน*เส้นใย", "Colour in\nthe *fibre", "色は\n*繊維の中に")} /></h2>
          <span className="rule" />
          <p>{L("พิมพ์ซับลิเมชันลงผ้า Mesh · B1 · C1 สีสด ไม่ลอก ไม่แตก ใส่แข่งได้ทั้งฤดูกาล", "Sublimation-printed on Mesh, B1 or C1: bright colour that doesn't peel or crack, season after season.", "Mesh・B1・C1に昇華プリント。鮮やかな色ははがれず割れず、シーズンを通して着られます。")}</p>
          <div className="ax-story-tags"><span>MESH</span><span>B1</span><span>C1</span></div>
          <Link href="/design" className="ax-story-go">{L("ออกแบบลายเองขั้นสูง", "Open the advanced designer", "詳細デザインエディタを開く")} <span aria-hidden="true">→</span></Link>
        </div>

        {/* 4 — names */}
        <div ref={P(4)} className="ax-story-panel left">
          <span className="ax-kicker">04 — {L("ชื่อและเบอร์", "Names & numbers", "名前と番号")}</span>
          <h2 className="ax-display"><Words text={L("ทุกคน\n*ในทีม", "Every\n*player", "選手\n*全員分")} /></h2>
          <span className="rule" />
          <p>{L("วางรายชื่อจาก Excel ครั้งเดียว ระบบใส่ชื่อและเบอร์ให้ทุกตัว พร้อมแยกไซซ์ให้โรงงาน", "Paste the roster from Excel once: every shirt gets its name and number, split by size for the factory.", "Excelの名簿を一度貼り付けるだけ。全員分の名前と番号が入り、工場向けにサイズ別に振り分けられます。")}</p>
          <Link href="/shop" className="ax-story-go">{L("ใส่ชื่อ-เบอร์ทั้งทีม", "Add your roster", "チーム全員の名前と番号を入れる")} <span aria-hidden="true">→</span></Link>
        </div>

        {/* 5 — team */}
        <div ref={P(5)} className="ax-story-panel bottom center">
          <span className="ax-kicker">05 — {L("ผลิตและส่งถึงทีม", "Made & delivered", "製造からお届けまで")}</span>
          <h2 className="ax-display"><Words text={L("ผ่าน *QC ทุกตัว", "Checked & *ready", "全数*検品")} /></h2>
          <div className="ax-story-stats">
            <div><b>5+</b><span>{L("ปีประสบการณ์", "Years making kit", "年の製造実績")}</span></div>
            <div><b>10+</b><span>{L("ประเทศที่ส่งออก", "Export countries", "輸出先の国")}</span></div>
            <div><b>50K+</b><span>{L("ตัวต่อเดือน", "Units a month", "枚/月")}</span></div>
            <div><b>QC</b><span>{L("ทุกขั้นตอน", "Every step", "全工程")}</span></div>
          </div>
          <div className="ax-row" style={{ justifyContent: "center" }}>
            <Link href="/tracking" className="ax-story-go">{L("ดูทั้ง 10 ขั้น และติดตามงานของคุณ", "See all ten steps, track your order", "全10工程を見る・注文を追跡")} <span aria-hidden="true">→</span></Link>
            <Link href="/account" className="ax-story-go">{L("ออเดอร์ของฉัน", "My orders", "注文履歴")} <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        {/* 6 — work */}
        <div ref={P(6)} className="ax-story-panel work">
          <div className="head">
            <span className="ax-kicker">06 — {L("ผลงานจริง", "Real work", "制作実績")}</span>
            <h2 className="ax-display"><Words text={L("ผลิต*ในบ้าน", "Made *in-house", "*自社工場で製造")} /></h2>
          </div>
          <div className="ax-story-cards">
            {WORK.map((w, i) => (
              <figure key={w.img}>
                <div className="pic"><img src={w.img} alt={`${w.t} — ${L(w.th, w.en, w.ja)}`} loading="lazy" /></div>
                <figcaption><i>{String(i + 1).padStart(2, "0")} / {String(WORK.length).padStart(2, "0")}</i><b>{w.t}</b><span>{L(w.th, w.en, w.ja)}</span></figcaption>
              </figure>
            ))}
          </div>
          <div className="ax-story-oem">
            <p>{L("ผลิตให้แบรนด์กีฬา ทีม สโมสร และร้านค้าทั้งในและต่างประเทศ ตั้งแต่เลือกผ้าจนถึงส่งมอบ ในโรงงานของเราเอง", "We make kit for sports brands, teams, clubs and retailers at home and abroad, from fabric choice to delivery, in our own factory.", "国内外のスポーツブランド、チーム、クラブ、販売店向けに、生地選びから納品まで自社工場で製造しています。")}</p>
            <ul>
              <li><span>RANGE</span>{L("เสื้อฟุตบอล ชุดวิ่ง เสื้อกล้าม ชุดทีม", "Football, running, tank tops, team kits", "サッカー、ランニング、タンクトップ、チームウェア")}</li>
              <li><span>PRINT</span>{L("Sublimation สกรีน ปัก DTF", "Sublimation, screen, embroidery, DTF", "昇華、シルク、刺繍、DTF")}</li>
              <li><span>FABRIC</span>{L("ผ้า Mesh · B1 · C1", "Mesh · B1 · C1 fabrics", "Mesh · B1 · C1 の生地")}</li>
              <li><span>SAMPLE</span>{L("รับออกแบบฟรีพร้อมทำตัวอย่าง", "Free design service with samples", "デザイン無料・サンプル製作対応")}</li>
              <li><span>MOQ</span>{L("MOQ ยืดหยุ่น รองรับแบรนด์เล็ก-ใหญ่", "Flexible MOQ for any brand size", "小ロットから大口まで柔軟に対応")}</li>
            </ul>
            <Link href="/templates" className="ax-story-go">{L("ดูลายในตลาดลาย", "Browse the template market", "テンプレートマーケットを見る")} <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        {/* 7 — call */}
        <div ref={P(7)} className="ax-story-panel top center">
          <span className="ax-kicker">07 — {L("เริ่มเลย", "Your turn", "さあ、始めよう")}</span>
          <h2 className="ax-display"><Words text={"Ready to\n*kick *off?"} /></h2>
          <div className="ax-row" style={{ justifyContent: "center" }}>
            <Link href="/shop" className="ax-btn solid">{L("เริ่มออกแบบเสื้อ", "Start designing", "デザインを始める")}</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="ax-btn ghost">{L("ส่งอีเมลถึงเรา", "Email us", "メールで問い合わせ")}</a>
          </div>
          <p className="ax-story-contact">{L("เริ่มออกแบบได้เลยโดยไม่ต้องสมัคร หรือติดต่อทีมงานเพื่อขอใบเสนอราคาและตัวอย่างผ้า", "Start designing without an account, or talk to us for a quote and fabric samples.", "アカウント登録なしですぐにデザインを始められます。お見積もりや生地サンプルはお気軽にお問い合わせください。")}
            <span className="ax-mono">{CONTACT_EMAIL} · LINE {CONTACT_LINE}</span></p>
          <nav className="ax-story-chips" aria-label={L("เมนู", "Menu", "メニュー")}>
              {SPOTS.map(sp => <Link key={sp.href} href={sp.href}>{L(sp.th, sp.en, sp.ja)}</Link>)}
            </nav>
        </div>

        <nav className="ax-story-nav" aria-label={L("บทของเรื่อง", "Chapters", "チャプター")}>
          <span className="count ax-mono"><span ref={counter}>01</span> / {String(CHAPTERS).padStart(2, "0")}</span>
          <div className="track" aria-hidden="true"><div ref={bar} className="fill" /></div>
          {CH.map((c, i) => (
            <button key={c} type="button" ref={e => { dots.current[i] = e; }} onClick={() => go(i)} aria-label={c}>
              <span>{c}</span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}

/** a ring that trails the pointer on mouse/trackpad devices; grows over links and buttons */
export function RingCursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const still = prefersReducedMotion();
    document.documentElement.classList.add("ax-cursor-on");
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      const hot = !!(e.target as Element | null)?.closest?.("a,button,[role=tab],input,select,textarea,canvas");
      ring.current?.toggleAttribute("data-hot", hot);
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      rx += (x - rx) * (still ? 1 : 0.18); ry += (y - ry) * (still ? 1 : 0.18);
      if (ring.current) ring.current.style.transform = `translate(${rx}px,${ry}px)`;
      if (dot.current) dot.current.style.transform = `translate(${x}px,${y}px)`;
    };
    const leave = () => { x = y = -100; };
    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.documentElement.classList.remove("ax-cursor-on");
    };
  }, []);
  return (
    <>
      <div ref={ring} className="ax-cursor-ring" aria-hidden="true" />
      <div ref={dot} className="ax-cursor-dot" aria-hidden="true" />
    </>
  );
}

function canvasTex(THREE: any, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/** the artwork that comes off the roller: the hero kit's colours and stripe */
function drawPrint(c: HTMLCanvasElement, k: Kit) {
  const x = c.getContext("2d")!;
  const { body, stripe, trim, number } = k.defaults.colors;
  const W = c.width, H = c.height;
  x.fillStyle = body; x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(0,0,0,.12)";
  for (let yy = 0; yy < H; yy += 18) for (let xx = 0; xx < W; xx += 18) {
    const r = 1 + 5 * (xx / W);
    x.beginPath(); x.arc(xx + ((yy / 18) % 2) * 9, yy, r, 0, Math.PI * 2); x.fill();
  }
  x.save();
  x.translate(W * 0.5, H * 0.5); x.rotate(-0.42);
  x.fillStyle = stripe; x.fillRect(-W, -46, W * 2, 92);
  x.fillStyle = trim; x.fillRect(-W, -58, W * 2, 8); x.fillRect(-W, 50, W * 2, 8);
  x.restore();
  x.fillStyle = number;
  x.font = '400 220px "Anton", sans-serif';
  x.textAlign = "right"; x.textBaseline = "alphabetic";
  x.fillText("10", W - 70, H - 70);
  x.font = '400 64px "Anton", sans-serif';
  x.textAlign = "left";
  x.fillText("AXIOM", 70, 120);
}
