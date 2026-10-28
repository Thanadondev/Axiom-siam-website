"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadThreeWithGltf, loadThreePost, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey, type Jersey } from "../lib/jersey3d";
import { KITS, defaultConfig } from "../lib/kits";
import { Words } from "./ScrollStory";
import { PIECES, SHEET_W, SHEET_H, M_PER_PX, drawSheet, paintPiece, tracePiece, cutPath, pathAt, type Piece, type PrintColors } from "../lib/process-pattern";

/**
 * /process — how a kit is made, as one walk down the production line.
 *
 * Ten stations stand in a row in the hall, one per step. Scrolling moves the
 * camera from station to station (it holds at each one, then travels); the
 * station in front of the camera plays its own little animation on a clock and
 * loops, so a visitor can stop and watch. The same job runs through all of them:
 * the shirt's pattern sheet is drawn on the screen, printed mirrored on paper,
 * pressed onto fabric, cut by the laser, checked, sewn, checked on the form,
 * size-labelled, folded and boxed, then driven away.
 */

const STEPS = [
  { th: "ทำไฟล์", en: "Artwork", h: "ทำ*ไฟล์", hEn: "The *file",
    p: "ออกแบบและเตรียมไฟล์งานพิมพ์ วางแพทเทิร์นทุกชิ้นของเสื้อลงบนแผ่นงานให้พร้อมพิมพ์",
    pEn: "Design and prepare the print file: every pattern piece of the shirt laid out on the sheet, ready to print." },
  { th: "พิมพ์", en: "Printing", h: "*พิมพ์", hEn: "*Print",
    p: "พิมพ์ลายลงกระดาษซับลิเมชั่น ลายบนกระดาษจะกลับด้าน เพื่อให้ออกมาถูกด้านเมื่อรีดลงผ้า",
    pEn: "The design is printed on sublimation paper, mirrored, so it reads the right way round once it's on the fabric." },
  { th: "รีด", en: "Heat transfer", h: "*รีด\nลงผ้า", hEn: "Heat\n*transfer",
    p: "รีดลายจากกระดาษลงบนผ้าด้วยความร้อน หมึกซึมเข้าไปในเนื้อผ้า",
    pEn: "Heat presses the design from the paper into the fabric." },
  { th: "ตัดเลเซอร์", en: "Laser cutting", h: "ตัด*เลเซอร์", hEn: "Laser *cut",
    p: "ตัดชิ้นงานผ้าตามแบบด้วยเลเซอร์ ตรงตามแพทเทิร์นทุกชิ้น",
    pEn: "Every piece is cut out by laser, following the pattern." },
  { th: "QC ก่อนเข้าเย็บ", en: "QC before sewing", h: "QC\nก่อน*เข้าเย็บ", hEn: "QC before\n*sewing",
    p: "ตรวจสอบชิ้นงานหลังตัดหรือรีด ก่อนส่งเข้าไลน์เย็บ",
    pEn: "The pieces are checked after cutting and pressing, before they go to the sewing line." },
  { th: "เย็บ", en: "Sewing", h: "*เย็บ", hEn: "*Sew",
    p: "ประกอบและเย็บเป็นตัวเสื้อผ้าสำเร็จรูป",
    pEn: "The pieces are assembled and sewn into the finished shirt." },
  { th: "QC ก่อนรีดแพ็ค", en: "QC before packing", h: "QC\nก่อน*รีดแพ็ค", hEn: "QC before\n*packing",
    p: "ตรวจสอบความเรียบร้อยของตัวเสื้อทั้งหมดก่อนแพ็คสินค้า",
    pEn: "Every finished shirt is checked over before it's packed." },
  { th: "รีดไซส์", en: "Size label", h: "รีด*ไซส์", hEn: "Size *label",
    p: "รีดป้ายไซส์ลงบนเสื้อ",
    pEn: "The size label is heat-pressed onto the shirt." },
  { th: "รีดและแพ็ค", en: "Press & pack", h: "รีด*และแพ็ค", hEn: "Press &\n*pack",
    p: "รีดเสื้อให้เรียบ พับ ใส่ถุง แล้วบรรจุลงกล่อง",
    pEn: "Pressed flat, folded, bagged and boxed." },
  { th: "จัดส่ง", en: "Delivery", h: "*จัดส่ง", hEn: "*Delivery",
    p: "ขึ้นรถ ส่งถึงทีมของคุณ",
    pEn: "Onto the truck and on its way to your team." },
];
const N = STEPS.length;
const CHAPTERS = N + 2; // the line from above, ten steps, the call
const GAP = 6; // metres between stations
const SX = (i: number) => (i - 1) * GAP; // station i (1..10) stands at x = SX(i), facing +z

const HERO = KITS.find(k => k.id === "striker")!;
const COLORS: PrintColors = HERO.defaults.colors;

/** how long each station's animation runs before it holds and loops (seconds) */
const DUR = [0, 7, 6, 6, 8, 6, 7, 5, 7, 9, 9];
/** what a station shows when it isn't playing (and with reduced motion) */
const STILL = [0, 1, 0.7, 0.7, 1, 1, 1, 1, 1, 1, 0];

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const easeIO = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const span = (u: number, a: number, b: number) => clamp01((u - a) / (b - a));
const bell = (p: number, c: number, w = 0.3) => ease((p - (c - w - 0.12)) / 0.12) * (1 - ease((p - (c + w)) / 0.12));
/** scroll position → camera position along the keyframes: hold at each chapter, travel between */
const camParam = (p: number) => { const k = Math.floor(p); return k + easeIO((p - k - 0.22) / 0.56); };

export default function ProcessStory({ th }: { th: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const [flat, setFlat] = useState(false);
  const thRef = useRef(th);
  thRef.current = th;

  // scroll → panels
  useEffect(() => {
    const still = prefersReducedMotion();
    let shown = 0, raf = 0, lastActive = -1;
    const read = () => {
      const el = root.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const sp = r.height - window.innerHeight;
      return sp > 0 ? clamp01(-r.top / sp) * (CHAPTERS - 1) : 0;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const target = read();
      shown += (target - shown) * (still || (window as any).__axProcU !== undefined ? 1 : 0.085);
      if (Math.abs(target - shown) < 0.0005) shown = target;
      const p = shown;
      (window as any).__axProcess = p;
      let active = 0;
      panels.current.forEach((el, i) => {
        if (!el) return;
        const a = i === 0 ? 1 - ease((p - 0.3) / 0.25) : i === CHAPTERS - 1 ? ease((p - (i - 0.4)) / 0.25) : bell(p, i);
        el.style.opacity = a.toFixed(3);
        el.style.visibility = a < 0.01 ? "hidden" : "visible";
        if (a > 0.6) active = i;
        el.toggleAttribute("data-on", a > 0.35);
      });
      if (active !== lastActive) {
        lastActive = active;
        dots.current.forEach((d, i) => d?.setAttribute("aria-current", i === active ? "step" : "false"));
        if (counter.current) counter.current.textContent = String(active).padStart(2, "0");
      }
      if (bar.current) bar.current.style.transform = `scaleY(${(p / (CHAPTERS - 1)).toFixed(3)})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the line
  useEffect(() => {
    if (!hasWebGL()) { setFlat(true); return; }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    loadThreeWithGltf().then(async (THREE: any) => {
      // phones go without bloom: it's a full-screen pass or three per frame
      const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
      const post = phone ? false : await loadThreePost();
      try { await Promise.all([(document as any).fonts?.load?.('400 100px "Anton"'), (document as any).fonts?.load?.('700 40px "Noto Sans Thai"')]); } catch { /* whatever loaded */ }
      if (disposed || !mount.current) return;
      const el = mount.current;
      const still = prefersReducedMotion();
      const small = Math.min(window.innerWidth, window.innerHeight) < 600;
      const trash: any[] = [];
      const keep = <T,>(o: T) => { trash.push(o); return o; };

      const renderer = new THREE.WebGLRenderer({ antialias: !post, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.35 : 1.6));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0a0a);
      scene.fog = new THREE.FogExp2(0x14110f, 0.014);
      const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 0.1, 300);

      // ---------- the hall: x −8…60, z −7…18, roof at 9 m; the end wall has the dock door ----------
      const H = { x0: -8, x1: 60, z0: -7, z1: 18, h: 9 };
      const HW = H.x1 - H.x0, HD = H.z1 - H.z0, HX = (H.x0 + H.x1) / 2, HZ = (H.z0 + H.z1) / 2;
      const floorTex = keep(canvasTex(THREE, 2048, 768, x => {
        const W = 2048, Hh = 768, m = W / HW;
        x.fillStyle = "#3a3b3d"; x.fillRect(0, 0, W, Hh);
        for (let i = 0; i < 22000; i++) {
          const v = 40 + Math.random() * 40;
          x.fillStyle = `rgba(${v},${v},${v + 2},${0.18 + Math.random() * 0.2})`;
          x.fillRect(Math.random() * W, Math.random() * Hh, 1 + Math.random() * 3, 1 + Math.random() * 3);
        }
        for (let i = 0; i < 30; i++) {
          const g = x.createRadialGradient(0, 0, 0, 0, 0, 30 + Math.random() * 120);
          g.addColorStop(0, "rgba(20,20,22,.22)"); g.addColorStop(1, "rgba(20,20,22,0)");
          x.save(); x.translate(Math.random() * W, Math.random() * Hh); x.fillStyle = g; x.fillRect(-160, -160, 320, 320); x.restore();
        }
        x.strokeStyle = "rgba(15,15,16,.55)"; x.lineWidth = 2;
        for (let k = 0; k <= HW; k += 4) { x.beginPath(); x.moveTo(k * m, 0); x.lineTo(k * m, Hh); x.stroke(); }
        for (let k = 0; k <= HD; k += 4) { x.beginPath(); x.moveTo(0, k * m); x.lineTo(W, k * m); x.stroke(); }
        const P = (wx: number, wz: number) => [(wx - H.x0) * m, (wz - H.z0) * m] as const;
        // the walkway along the line, and each station's number painted in front of it
        x.strokeStyle = "#d9a81e"; x.lineWidth = 0.12 * m;
        for (const z of [3.1, -2.7]) { const [a, b] = P(-4, z), [c] = P(55, z); x.beginPath(); x.moveTo(a, b); x.lineTo(c, b); x.stroke(); }
        x.fillStyle = "rgba(217,168,30,.85)"; x.textAlign = "center"; x.textBaseline = "middle";
        x.font = `400 ${1.1 * m}px "Anton", sans-serif`;
        for (let i = 1; i <= N; i++) { const [a, b] = P(SX(i), 2.35); x.fillText(String(i).padStart(2, "0"), a, b); }
      }));
      floorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(HW, HD)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.08 })));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(HX, 0, HZ);
      floor.receiveShadow = true;
      scene.add(floor);

      const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 }));
      const unit = keep(new THREE.PlaneGeometry(1, 1));
      const plane = (w: number, h: number, x: number, y: number, z: number, ry: number, mat = wallMat) => {
        const m = new THREE.Mesh(unit, mat);
        m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
        scene.add(m);
        return m;
      };
      plane(HW, H.h, HX, H.h / 2, H.z0, 0);
      plane(HD, H.h, H.x0, H.h / 2, HZ, Math.PI / 2);
      plane(HW, H.h, HX, H.h / 2, H.z1, Math.PI);
      // the end wall, around the dock door (z −2.4…2.4, up to 4.4 m)
      const DOOR = { z: 2.4, h: 4.4 };
      plane(H.z1 - DOOR.z, H.h, H.x1, H.h / 2, (H.z1 + DOOR.z) / 2, -Math.PI / 2);
      plane(DOOR.z - H.z0, H.h, H.x1, H.h / 2, (H.z0 - DOOR.z) / 2, -Math.PI / 2);
      plane(DOOR.z * 2, H.h - DOOR.h, H.x1, (H.h + DOOR.h) / 2, 0, -Math.PI / 2);
      const ceil = new THREE.Mesh(unit, keep(new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 1 })));
      ceil.scale.set(HW, HD, 1); ceil.rotation.x = Math.PI / 2; ceil.position.set(HX, H.h, HZ);
      scene.add(ceil);
      // dusk through the window band
      const winTex = keep(canvasTex(THREE, 1024, 128, x => {
        const g = x.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#2a3550"); g.addColorStop(0.55, "#d0662c"); g.addColorStop(1, "#ffb066");
        x.fillStyle = g; x.fillRect(0, 0, 1024, 128);
        x.fillStyle = "#0c0c0d";
        for (let i = 0; i <= 1024; i += 32) x.fillRect(i - 2, 0, 4, 128);
        x.fillRect(0, 60, 1024, 5); x.fillRect(0, 0, 1024, 5); x.fillRect(0, 123, 1024, 5);
      }));
      const band = new THREE.Mesh(unit, keep(new THREE.MeshBasicMaterial({ map: winTex, fog: false })));
      band.scale.set(HW - 4, 1.8, 1); band.position.set(HX, 7.1, H.z0 + 0.05);
      scene.add(band);

      // ---------- outside the dock: yard, sky ----------
      const yard = new THREE.Mesh(keep(new THREE.PlaneGeometry(120, 90)), keep(new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.9 })));
      yard.rotation.x = -Math.PI / 2; yard.position.set(H.x1 + 60, -0.01, 0);
      yard.receiveShadow = true;
      scene.add(yard);
      const skyTex = keep(canvasTex(THREE, 16, 256, x => {
        const g = x.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#1b2338"); g.addColorStop(0.55, "#a8502a"); g.addColorStop(0.8, "#ffae5e"); g.addColorStop(1, "#3a2a22");
        x.fillStyle = g; x.fillRect(0, 0, 16, 256);
      }));
      const sky = new THREE.Mesh(unit, keep(new THREE.MeshBasicMaterial({ map: skyTex, fog: false })));
      sky.scale.set(160, 50, 1); sky.position.set(H.x1 + 110, 14, 0); sky.rotation.y = -Math.PI / 2;
      scene.add(sky);

      // ---------- light ----------
      scene.add(new THREE.HemisphereLight(0xf3e6d4, 0x1a1714, 0.45));
      const key = new THREE.DirectionalLight(0xffe9cc, 0.72);
      key.castShadow = true;
      key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
      Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.015;
      scene.add(key, key.target);
      const fill = new THREE.DirectionalLight(0x9fb4ff, 0.25);
      fill.position.set(-10, 6, 12);
      scene.add(fill);
      const rim = new THREE.PointLight(0xff7a3a, 0.9, 9, 2);
      scene.add(rim);

      // high-bay lamps over each station, with soft cones
      const beamMat = keep(new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN, vV)), 1.8); float h = smoothstep(0.0, 1.0, vUv.y); gl_FragColor = vec4(1.0, 0.9, 0.75, 0.06 * rim * h); }",
      }));
      const LAMP_Y = 6.4;
      const beamGeo = keep(new THREE.CylinderGeometry(0.5, 2.6, LAMP_Y, 28, 1, true));
      beamGeo.translate(0, -LAMP_Y / 2, 0);
      for (let i = 1; i <= N; i++) {
        const b = new THREE.Mesh(beamGeo, beamMat);
        b.position.set(SX(i), LAMP_Y, 0.2);
        scene.add(b);
      }

      // ---------- the station signs, hung over each step ----------
      for (let i = 1; i <= N; i++) {
        const s = STEPS[i - 1];
        const tex = keep(canvasTex(THREE, 1024, 256, x => {
          x.fillStyle = "#141518"; x.fillRect(0, 0, 1024, 256);
          x.fillStyle = "#f26522"; x.fillRect(0, 0, 12, 256);
          x.font = '400 170px "Anton", sans-serif'; x.textBaseline = "alphabetic"; x.textAlign = "left";
          x.fillText(String(i).padStart(2, "0"), 50, 200);
          x.fillStyle = "#f2f0eb"; x.font = '700 78px "Noto Sans Thai", sans-serif';
          x.fillText(s.th, 290, 140);
          x.fillStyle = "#8d8a84"; x.font = '500 34px "Sora", sans-serif';
          x.fillText(s.en.toUpperCase(), 292, 200);
        }));
        const sign = new THREE.Mesh(unit, keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 })));
        sign.scale.set(2.2, 0.55, 1);
        sign.position.set(SX(i), 3.9, -2.3);
        scene.add(sign);
        for (const dx of [-0.9, 0.9]) {
          const w = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, H.h - 4.17, 4)), keep(new THREE.MeshBasicMaterial({ color: 0x333438 })));
          w.position.set(SX(i) + dx, (H.h + 4.17) / 2, -2.3);
          scene.add(w);
        }
      }

      // ---------- shared art: the pattern sheet ----------
      const sheetCanvas = (opts: Parameters<typeof drawSheet>[2], w = 1024) => {
        const c = document.createElement("canvas");
        c.width = w; c.height = Math.round(w * SHEET_H / SHEET_W);
        drawSheet(c, COLORS, opts);
        const t = keep(new THREE.CanvasTexture(c));
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
      };
      const paperTex = sheetCanvas({ mirror: true, ground: "#f7f6f2", marks: true });
      paperTex.wrapT = THREE.RepeatWrapping;
      const fabricTex = sheetCanvas({ ground: "#d8d6d1" });
      fabricTex.wrapT = THREE.RepeatWrapping;
      // the cut pieces as meshes, mapped onto the printed fabric
      const pieceGeo = (p: Piece) => {
        const shape = new THREE.Shape(p.pts.map(([x, y]) => new THREE.Vector2(x - p.c[0], (SHEET_H - y) - (SHEET_H - p.c[1]))));
        const g = new THREE.ShapeGeometry(shape);
        const pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + p.c[0]) / SHEET_W, (pos.getY(i) + SHEET_H - p.c[1]) / SHEET_H);
        g.scale(M_PER_PX, M_PER_PX, 1);
        g.rotateX(-Math.PI / 2);
        return keep(g);
      };
      const PIECE_GEO = PIECES.map(pieceGeo);
      const pieceMat = keep(new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 0.85, side: THREE.DoubleSide }));
      /** a set of pieces laid out as on the sheet; each child sits at its piece's centre */
      const pieceSet = (spread = 1, shadow = false) => {
        const g = new THREE.Group();
        PIECES.forEach((p, i) => {
          const m = new THREE.Mesh(PIECE_GEO[i], pieceMat);
          m.position.set((p.c[0] - SHEET_W / 2) * M_PER_PX * spread, 0, (p.c[1] - SHEET_H / 2) * M_PER_PX * spread);
          m.castShadow = shadow; m.receiveShadow = true;
          m.userData.home = m.position.clone();
          g.add(m);
        });
        return g;
      };
      // a strip of paper or fabric that runs through a machine: `feed` moves it along
      const stripMat = (map: any, emerging: boolean, k: number) => keep(new THREE.ShaderMaterial({
        uniforms: { uMap: { value: map }, uFeed: { value: 0 }, uK: { value: k }, uEmerge: { value: emerging ? 1 : 0 }, uBlank: { value: new THREE.Color(0xe4e3df) } },
        side: THREE.DoubleSide,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `uniform sampler2D uMap; uniform float uFeed; uniform float uK; uniform float uEmerge; uniform vec3 uBlank; varying vec2 vUv;
          void main(){
            float s = 1.0 - vUv.y;            // 0 where it leaves the machine
            float t = uFeed - s * uK;          // how far into the sheet this bit is
            vec3 c = texture2D(uMap, vec2(vUv.x, 1.0 - fract(t))).rgb;
            float done = uEmerge > 0.5 ? step(0.0, t) : 1.0;
            gl_FragColor = vec4(mix(uBlank, c, done) * 0.6, 1.0);
          }`,
      }));
      // a flat tee (for the size label and the packing): front print inside the silhouette
      const teeTex = keep(canvasTex(THREE, 512, 512, x => {
        x.beginPath();
        x.moveTo(196, 30); x.quadraticCurveTo(256, 96, 316, 30);
        x.lineTo(410, 62); x.lineTo(500, 168); x.lineTo(430, 222); x.lineTo(392, 178);
        x.lineTo(396, 496); x.lineTo(116, 496); x.lineTo(120, 178); x.lineTo(82, 222); x.lineTo(12, 168); x.lineTo(102, 62);
        x.closePath();
        x.save(); x.clip();
        x.fillStyle = COLORS.sleeve; x.fillRect(0, 0, 512, 512);
        x.fillStyle = COLORS.body; x.fillRect(118, 30, 276, 470);
        x.save(); x.translate(256, 250); x.rotate(-0.5);
        x.fillStyle = COLORS.trim; x.fillRect(-400, -34, 800, 68);
        x.fillStyle = COLORS.stripe; x.fillRect(-400, -27, 800, 54);
        x.restore();
        x.fillStyle = COLORS.trim; x.fillRect(118, 486, 276, 12);
        x.fillStyle = COLORS.number; x.font = '400 30px "Anton", sans-serif'; x.fillText("AXIOM", 150, 132);
        x.beginPath(); x.moveTo(330, 100); x.lineTo(360, 100); x.lineTo(360, 122); x.quadraticCurveTo(345, 142, 330, 122); x.closePath(); x.fill();
        x.restore();
        x.strokeStyle = COLORS.trim; x.lineWidth = 6;
        x.beginPath(); x.moveTo(196, 30); x.quadraticCurveTo(256, 96, 316, 30); x.stroke();
      }));
      const teeMat = keep(new THREE.MeshStandardMaterial({ map: teeTex, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }));
      const teeGeo = keep(new THREE.PlaneGeometry(1, 1));
      teeGeo.rotateX(-Math.PI / 2);

      const labelTex = keep(canvasTex(THREE, 128, 96, x => {
        x.fillStyle = "#f7f6f2"; x.fillRect(0, 0, 128, 96);
        x.fillStyle = "#16171a"; x.textAlign = "center";
        x.font = '400 18px "Anton", sans-serif'; x.fillText("AXIOM", 64, 24);
        x.font = '400 46px "Anton", sans-serif'; x.fillText("L", 64, 72);
        x.font = '500 11px "Sora", sans-serif'; x.fillText("100% POLYESTER", 64, 90);
      }));
      const checkTex = keep(canvasTex(THREE, 128, 128, x => {
        x.fillStyle = "#2aa96b"; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
        x.strokeStyle = "#fff"; x.lineWidth = 14; x.lineCap = "round"; x.lineJoin = "round";
        x.beginPath(); x.moveTo(36, 66); x.lineTo(56, 86); x.lineTo(94, 44); x.stroke();
      }));
      const glowTex = keep(canvasTex(THREE, 64, 64, x => {
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,190,140,.6)"); g.addColorStop(1, "rgba(255,120,40,0)");
        x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      }));
      const puffTex = keep(canvasTex(THREE, 64, 64, x => {
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      }));
      const sprite = (map: any, size: number, additive = false) => {
        const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })));
        s.scale.set(size, size, 1);
        return s;
      };

      // ---------- station groups (built now; the modelled machines arrive with the glb) ----------
      const st: any[] = [null];
      for (let i = 1; i <= N; i++) { const g = new THREE.Group(); g.position.x = SX(i); scene.add(g); st.push(g); }

      // 1 · the screen on the designer's desk
      const scr = document.createElement("canvas");
      scr.width = 896; scr.height = 508;
      const scrTex = keep(new THREE.CanvasTexture(scr));
      scrTex.encoding = THREE.sRGBEncoding;
      const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.74, 0.42)), keep(new THREE.MeshBasicMaterial({ map: scrTex, color: 0xb8b8b8 })));
      screen.position.set(0, 1.14, -0.081);
      st[1].add(screen);
      const side = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.52, 0.3)), keep(new THREE.MeshBasicMaterial({ color: 0xb8b8b8, map: keep(canvasTex(THREE, 512, 296, x => drawReference(x, 512, 296))) })));
      side.rotation.y = 0.4887;
      side.position.set(-0.6525 + 0.469 * 0.004, 1.04, -0.1459 + 0.883 * 0.004);
      st[1].add(side);
      let scrQ = -1;
      const drawScreen = (u: number) => {
        const q = Math.round(u * 120);
        if (q === scrQ) return;
        scrQ = q;
        drawDesigner(scr, u, thRef.current);
        scrTex.needsUpdate = true;
      };

      // 2 · paper out of the printer
      const PAPER_LEN = 0.6;
      const paperMat = stripMat(paperTex, true, PAPER_LEN / (SHEET_H * M_PER_PX));
      const paper = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.0, PAPER_LEN)), paperMat);
      paper.position.set(0, 0.97 - 0.29, 0.38);
      paper.rotation.x = -0.27;
      st[2].add(paper);

      // 3 · paper into the calender, printed fabric out
      const feedIn = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 0.7)), stripMat(paperTex, false, -0.7 / (SHEET_H * M_PER_PX)));
      feedIn.rotation.x = -Math.PI / 2;
      feedIn.position.set(0, 0.885, 1.0);
      st[3].add(feedIn);
      const feedOut = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, 0.56)), stripMat(fabricTex, true, 0.56 / (SHEET_H * M_PER_PX)));
      feedOut.rotation.x = Math.PI / 2 - 0.24;
      feedOut.position.set(0, 0.74, -0.95);
      st[3].add(feedOut);
      const heat = new THREE.PointLight(0xff6a2a, 0, 3, 2);
      heat.position.set(0, 1.0, 0);
      st[3].add(heat);

      // 4 · the laser bed: fabric, printed pieces, the cut line, the beam's spark
      const BED_Y = 0.842;
      const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(SHEET_W * M_PER_PX, SHEET_H * M_PER_PX)), keep(new THREE.MeshStandardMaterial({ color: 0xcfcdc8, roughness: 0.9 })));
      ground.rotation.x = -Math.PI / 2; ground.position.y = BED_Y;
      st[4].add(ground);
      const bedPieces = pieceSet();
            bedPieces.position.y = BED_Y + 0.006;
      st[4].add(bedPieces);
      const path = cutPath();
      const toBed = ([px, py]: [number, number]) => [(px - SHEET_W / 2) * M_PER_PX, (py - SHEET_H / 2) * M_PER_PX] as const;
      const ribbon = (() => {
        const v: number[] = [];
        const segEnd: number[] = [];
        const w = 0.007;
        for (let i = 0; i < path.pts.length - 1; i++) {
          if (path.cut[i]) {
            const [ax, az] = toBed(path.pts[i]), [bx, bz] = toBed(path.pts[i + 1]);
            const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
            v.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx + nx, 0, bz + nz, bx + nx, 0, bz + nz, ax - nx, 0, az - nz, bx - nx, 0, bz - nz);
          }
          segEnd.push(v.length / 3);
        }
        const g = keep(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
        const m = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ color: 0xff5a10, toneMapped: false })));
        m.position.y = BED_Y + 0.009;
        m.frustumCulled = false;
        return { m, g, segEnd };
      })();
      st[4].add(ribbon.m);
      const spark = sprite(glowTex, 0.16, true);
      st[4].add(spark);
      const laserLight = new THREE.PointLight(0xff7a3a, 0, 0.9, 2);
      st[4].add(laserLight);
      const LASER_Y = 0.98, PARK: [number, number] = [-0.95, -0.72];

      // 5 · QC table: pieces spread out, a scan bar, a tick on each piece
      const qcPieces = pieceSet(1.05);
      qcPieces.position.y = 0.866;
      st[5].add(qcPieces);
      const scanBar = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.05, 1.22)), keep(new THREE.MeshBasicMaterial({ color: 0x7fffc0, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      scanBar.rotation.x = -Math.PI / 2; scanBar.position.y = 0.875;
      st[5].add(scanBar);
      const ticks = PIECES.map(p => {
        const s = sprite(checkTex, 0.1);
        s.position.set((p.c[0] - SHEET_W / 2) * M_PER_PX * 1.05, 0.98, (p.c[1] - SHEET_H / 2) * M_PER_PX * 1.05);
        st[5].add(s);
        return s;
      });

      // 6 · sewing: a stack of pieces goes under the needle, the shirt comes off onto the form
      const sewPieces = pieceSet(0.0001, true);
      sewPieces.scale.setScalar(0.42);
      sewPieces.position.set(-0.4, 0.792, 0.02);
      sewPieces.children.forEach((m: any, i: number) => { m.position.set(0, i * 0.012, 0); m.rotation.y = (i - 2) * 0.12; m.userData.home = m.position.clone(); });
      st[6].add(sewPieces);
      const needle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 6)), keep(new THREE.MeshStandardMaterial({ color: 0xd7d9dc, metalness: 1, roughness: 0.2 })));
      needle.position.set(-0.18, 0.9, -0.02);
      st[6].add(needle);
      const sewRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.42, 0.008, 6, 48)), keep(new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, toneMapped: false })));
      sewRing.rotation.x = Math.PI / 2;
      st[6].add(sewRing);
      const FORM6 = new THREE.Vector3(SX(6) + 1.25, 0, 0.15), FORM7 = new THREE.Vector3(SX(7), 0, 0);
      sewRing.position.set(FORM6.x - SX(6), 1.2, FORM6.z);

      // 7 · QC on the form: a ring of light passes over the shirt, then the tick
      const qcRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.3, 0.007, 6, 48)), keep(new THREE.MeshBasicMaterial({ color: 0x7fffc0, transparent: true, opacity: 0, toneMapped: false })));
      qcRing.rotation.x = Math.PI / 2; qcRing.scale.set(1.25, 0.85, 1);
      st[7].add(qcRing);
      const qcTick = sprite(checkTex, 0.2);
      qcTick.position.set(0.42, 1.7, 0.05);
      st[7].add(qcTick);

      // 8 · size label: the tee goes onto the press, the press closes, opens, the label is there
      const pressTee = new THREE.Mesh(teeGeo, teeMat);
      pressTee.scale.set(0.56, 1, 0.58);
      pressTee.castShadow = true; pressTee.receiveShadow = true;
      st[8].add(pressTee);
      const label = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.1, 0.075)), keep(new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, opacity: 0, roughness: 0.6 })));
      label.rotation.x = -Math.PI / 2;
      st[8].add(label);
      const puffs = Array.from({ length: 7 }, (_, k) => { const s = sprite(puffTex, 0.2, true); s.userData.k = k; st[8].add(s); return s; });
      const pressGlow = new THREE.PointLight(0xff6a2a, 0, 1.2, 2);
      pressGlow.position.set(0, 1.0, 0.0);
      st[8].add(pressGlow);
      let pressUpper: any = null;

      // 9 · pack: fold, bag, box, close, tape
      const packTee = new THREE.Group();
      const packFlat = new THREE.Mesh(teeGeo, teeMat);
      packFlat.castShadow = true;
      packTee.add(packFlat);
      const folded = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS.body).convertSRGBToLinear(), roughness: 0.85 })));
      folded.castShadow = true;
      packTee.add(folded);
      const bag = new THREE.Mesh(keep(new THREE.BoxGeometry(0.38, 0.05, 0.36)), keep(new THREE.MeshStandardMaterial({ color: 0xdfe9ee, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.1, depthWrite: false })));
      packTee.add(bag);
      st[9].add(packTee);
      const cardboard = keep(new THREE.MeshStandardMaterial({ color: new THREE.Color("#a77b4f").convertSRGBToLinear(), roughness: 0.85 }));
      const BOX = { w: 0.46, h: 0.3, d: 0.4, x: 0.36, z: -0.04, y: 0.82 };
      const carton = new THREE.Group();
      carton.position.set(BOX.x, BOX.y, BOX.z);
      const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), cardboard);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        carton.add(m);
      };
      wall(BOX.w, 0.006, BOX.d, 0, 0.003, 0);
      wall(BOX.w, BOX.h, 0.006, 0, BOX.h / 2, BOX.d / 2);
      wall(BOX.w, BOX.h, 0.006, 0, BOX.h / 2, -BOX.d / 2);
      wall(0.006, BOX.h, BOX.d, BOX.w / 2, BOX.h / 2, 0);
      wall(0.006, BOX.h, BOX.d, -BOX.w / 2, BOX.h / 2, 0);
      const flap = (len: number, wid: number, axis: "x" | "z", sign: number, y: number) => {
        const pivot = new THREE.Group();
        const g = keep(axis === "z" ? new THREE.BoxGeometry(wid, 0.005, len) : new THREE.BoxGeometry(len, 0.005, wid));
        if (axis === "z") g.translate(0, 0, -sign * len / 2); else g.translate(-sign * len / 2, 0, 0);
        const m = new THREE.Mesh(g, cardboard);
        m.castShadow = true;
        pivot.add(m);
        if (axis === "z") pivot.position.set(0, y, sign * BOX.d / 2); else pivot.position.set(sign * BOX.w / 2, y, 0);
        pivot.userData = { axis, sign };
        carton.add(pivot);
        return pivot;
      };
      const flapsSide = [flap(BOX.w / 2 - 0.004, BOX.d, "x", 1, BOX.h), flap(BOX.w / 2 - 0.004, BOX.d, "x", -1, BOX.h)];
      const flapsEnd = [flap(BOX.d / 2, BOX.w, "z", 1, BOX.h + 0.006), flap(BOX.d / 2, BOX.w, "z", -1, BOX.h + 0.006)];
      const tape = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 0.003, 0.05)), keep(new THREE.MeshStandardMaterial({ color: new THREE.Color("#c8a26f").convertSRGBToLinear(), roughness: 0.3 })));
      tape.position.set(0, BOX.h + 0.01, 0);
      carton.add(tape);
      const shipLabel = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.16, 0.1)), keep(new THREE.MeshStandardMaterial({ map: keep(canvasTex(THREE, 160, 100, x => {
        x.fillStyle = "#f7f6f2"; x.fillRect(0, 0, 160, 100);
        x.fillStyle = "#f26522"; x.fillRect(0, 0, 160, 22);
        x.fillStyle = "#fff"; x.font = '400 16px "Anton", sans-serif'; x.fillText("AXIOM SIAM", 8, 17);
        x.fillStyle = "#16171a";
        for (let k = 0; k < 18; k++) x.fillRect(10 + k * 7, 34, k % 3 ? 3 : 5, 40);
        x.font = '500 11px "Sora", sans-serif'; x.fillText("FB-01 · L × 1", 10, 92);
      })), roughness: 0.6, transparent: true, opacity: 0 })));
      shipLabel.position.set(0, BOX.h * 0.55, BOX.d / 2 + 0.004);
      carton.add(shipLabel);
      st[9].add(carton);

      // 10 · dock: a raised platform, the pallet, the truck outside the door
      const dock = new THREE.Mesh(keep(new THREE.BoxGeometry(H.x1 - 55.4, 0.95, 6.4)), keep(new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.6 })));
      dock.position.set((55.4 + H.x1) / 2, 0.475, 0);
      dock.receiveShadow = true; dock.castShadow = true;
      scene.add(dock);
      const edgeTex = keep(canvasTex(THREE, 256, 32, x => {
        for (let i = -1; i < 18; i++) { x.fillStyle = i % 2 ? "#e0b21a" : "#141518"; x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 16, 32); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, 0); x.fill(); }
      }));
      edgeTex.wrapS = THREE.RepeatWrapping; edgeTex.repeat.set(6, 1);
      const edge = new THREE.Mesh(keep(new THREE.PlaneGeometry(6.4, 0.25)), keep(new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.6 })));
      edge.position.set(55.39, 0.82, 0); edge.rotation.y = -Math.PI / 2;
      scene.add(edge);
      for (const z of [-2.2, 2.2]) {
        const b = new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.5, 0.3)), keep(new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.85 })));
        b.position.set(H.x1 + 0.08, 0.8, z);
        scene.add(b);
      }
      const doorBox = new THREE.Mesh(keep(new THREE.BoxGeometry(0.6, 0.55, DOOR.z * 2 + 0.3)), keep(new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.45 })));
      doorBox.position.set(H.x1 - 0.32, DOOR.h + 0.2, 0);
      scene.add(doorBox);
      const dockLamp = new THREE.PointLight(0xffd9a8, 0.8, 8, 2);
      dockLamp.position.set(H.x1 - 0.6, 3.6, 2.0);
      scene.add(dockLamp);
      const shipment = new THREE.Group(); // the pallet and its load; rides into the truck
      shipment.position.set(57.4, 0.95, 0);
      scene.add(shipment);
      let truck: any = null, truckDoor: any = null;
      const TRUCK_X = H.x1 + 0.15 + 3.0; // rear of the box just outside the door

      // the shirt (3D) for sewing and QC
      let jersey: Jersey | null = null;
      let jerseyLoading = false;
      const JS = 0.26, CHEST = 1.3;
      const loadShirt = () => {
        if (jerseyLoading) return;
        jerseyLoading = true;
        loadJersey(THREE, HERO).then(j => {
          if (disposed) { j.dispose(); return; }
          const c = defaultConfig(HERO);
          j.setLook({ colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: "", number: "10", font: c.font });
          j.group.scale.setScalar(JS);
          j.group.traverse((m: any) => { if (m.isMesh) m.castShadow = true; });
          const holder = new THREE.Group(); // pivots at the chest, so it grows in place
          j.group.position.y = (typeof j.formBase === "number" ? -j.formBase * JS : 1.25) - CHEST;
          holder.add(j.group);
          holder.visible = false;
          scene.add(holder);
          (j as any).holder = holder;
          jersey = j;
        }).catch(() => {});
      };
      const idle = window.setTimeout(() => { if (!small) loadShirt(); }, 2500);

      // ---------- the modelled machines ----------
      type Prim = { geo: any; mat: any; local: any };
      const loadKit = (url: string) => new Promise<Record<string, Prim[]> | null>(res => {
        new THREE.GLTFLoader().load(url, (gltf: any) => {
          gltf.scene.updateMatrixWorld(true);
          const prims: Record<string, Prim[]> = {};
          gltf.scene.children.forEach((r: any) => {
            const list: Prim[] = [];
            r.traverse((o: any) => {
              if (!o.isMesh) return;
              const m = o.material;
              if (m.name === "Glow") { m.emissiveIntensity = 2.2; m.toneMapped = false; }
              if (m.name === "Screen") m.emissiveIntensity = 1.4;
              if (m.name === "LightPanel") { m.emissiveIntensity = 0.1; m.color.multiplyScalar(0.7); }
              if (m.name === "Fabric") m.color.setHex(0xffffff);
              list.push({ geo: o.geometry, mat: m, local: o.matrixWorld.clone() });
              trash.push(o.geometry, m);
            });
            prims[r.name] = list;
          });
          res(prims);
        }, undefined, () => res(null));
      });
      const tinted = new Map<string, any>();
      const tintMat = (m: any, hex: number) => {
        const k = m.uuid + hex;
        if (!tinted.has(k)) { const c = m.clone(); c.color.setHex(hex).convertSRGBToLinear(); tinted.set(k, c); trash.push(c); }
        return tinted.get(k);
      };
      /** one prop as a group of meshes */
      const one = (prims: Record<string, Prim[]> | null, name: string, at: any, opts: { x?: number; y?: number; z?: number; ry?: number; tint?: number; shadow?: boolean } = {}) => {
        const g = new THREE.Group();
        (prims?.[name] || []).forEach(({ geo, mat, local }) => {
          const m = new THREE.Mesh(geo, opts.tint !== undefined && mat.name === "Fabric" ? tintMat(mat, opts.tint) : mat);
          m.applyMatrix4(local);
          m.castShadow = opts.shadow !== false; m.receiveShadow = true;
          g.add(m);
        });
        g.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
        g.rotation.y = opts.ry ?? 0;
        at.add(g);
        return g;
      };
      /** a prop instanced at many matrices */
      const many = (prims: Record<string, Prim[]> | null, name: string, mats: any[], tint?: (i: number) => number, shadow = false) => {
        (prims?.[name] || []).forEach(({ geo, mat, local }) => {
          const groups = new Map<any, any[]>();
          mats.forEach((m4, i) => {
            const m = tint && mat.name === "Fabric" ? tintMat(mat, tint(i)) : mat;
            if (!groups.has(m)) groups.set(m, []);
            groups.get(m)!.push(m4);
          });
          groups.forEach((list, m) => {
            const im = new THREE.InstancedMesh(geo, m, list.length);
            const tmp = new THREE.Matrix4();
            list.forEach((m4: any, i: number) => im.setMatrixAt(i, tmp.multiplyMatrices(m4, local)));
            im.castShadow = shadow; im.receiveShadow = true;
            scene.add(im);
            trash.push(im);
          });
        });
      };
      const q = new THREE.Quaternion(), eul = new THREE.Euler(), one3 = new THREE.Vector3(1, 1, 1);
      const M = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone().setFromEuler(eul.set(0, ry, 0)), one3);
      const TINTS = [0xf26522, 0x2f6fd6, 0xe23b3b, 0xf2f0eb, 0x1d1f23, 0xf5c518, 0x2aa96b, 0x0054a6];
      const BLUE = 0x0054a6;

      let printerHead: any = null, gantry: any = null, laserHead: any = null;
      Promise.all([loadKit("/models/factory/factory_kit.glb"), loadKit("/models/factory/process_kit.glb")]).then(([fk, pk]) => {
        if (disposed) return;
        // the hall's steel and lamps
        const colH = new THREE.Vector3(1, H.h / 14, 1);
        many(fk, "column", Array.from({ length: 11 }, (_, k) => new THREE.Matrix4().compose(new THREE.Vector3(-3 + k * GAP, 0, H.z0 + 0.35), q, colH)));
        many(fk, "truss", [-2, 4, 10].flatMap(z => Array.from({ length: 11 }, (_, k) => M(-5 + k * 6, H.h - 2.4, z))));
        many(fk, "highbay", Array.from({ length: N }, (_, k) => M(SX(k + 1), LAMP_Y, 0.2)));
        many(fk, "wall_fan", Array.from({ length: 5 }, (_, k) => M(1.5 + k * 12, 4.2, H.z0 + 0.3, 0)));
        // fabric store along the back wall behind the first stations, finished kit behind the last
        const racks: any[] = [], rolls: any[] = [];
        for (const x of [-6.5, -3.7, 4.6, 7.4]) {
          const R = M(x, 0, H.z0 + 1.1);
          racks.push(R);
          for (let lv = 0; lv < 4; lv++) for (const d of [-0.36, 0, 0.36]) rolls.push(R.clone().multiply(M(0, 0.42 + lv * 0.95, d)));
        }
        many(fk, "roll_rack", racks);
        many(fk, "fabric_roll", rolls, i => TINTS[(i * 5 + Math.floor(i / 12)) % TINTS.length]);
        const gr: any[] = [], tees: any[] = [];
        for (const x of [34.6, 37.4, 46.6]) {
          const R = M(x, 0, -2.9);
          gr.push(R);
          for (let k = 0; k < 8; k++) tees.push(R.clone().multiply(M(-0.7 + k * 0.2, 1.78, 0, Math.PI / 2 + Math.sin(k * 7.3 + x) * 0.12)));
        }
        many(fk, "garment_rack", gr);
        many(fk, "shirt_hanging", tees, i => (i < 16 ? BLUE : TINTS[Math.floor(i / 8) % TINTS.length]));

        // 1 · design
        one(pk, "design_desk", st[1]);
        // 2 · print
        one(pk, "sub_printer", st[2]);
        printerHead = one(pk, "printer_head", st[2], { y: 1.07, z: 0.22 });
        // 3 · calender: paper and fabric in at the front, printed fabric out the back
        one(fk, "calender", st[3], { tint: BLUE });
        // 4 · laser
        one(pk, "laser_cutter", st[4]);
        gantry = one(pk, "laser_gantry", st[4], { y: LASER_Y });
        laserHead = one(pk, "laser_head", st[4], { y: LASER_Y });
        // 5 · QC
        one(pk, "qc_table", st[5]);
        // 6 · sewing: the bench, the job under the needle, the form the shirt comes off onto
        one(fk, "sewing_station", st[6], { tint: BLUE });
        one(fk, "work_cloth", st[6], { tint: BLUE, shadow: false });
        one(fk, "sewing_station", st[6], { x: -1.6, z: -1.3, tint: 0x231f20 });
        one(fk, "dress_form", scene, { x: FORM6.x, z: FORM6.z, ry: -0.35 });
        one(fk, "trolley", st[6], { x: -1.5, z: 0.6, ry: 0.3, tint: BLUE });
        // 7 · QC on the form
        one(fk, "dress_form", scene, { x: FORM7.x, z: FORM7.z });
        // 8 · size-label press
        one(pk, "heat_press", st[8]);
        pressUpper = one(pk, "press_upper", st[8], { y: 1.12, z: -0.33 });
        // 9 · pack
        one(pk, "pack_table", st[9]);
        many(fk, "carton", [0, 1, 2].map(k => M(SX(9) + 1.4, 0.0 + k * 0.4, -0.2 + (k % 2) * 0.05, k * 0.1)), undefined, true);
        // 10 · ship
        one(fk, "pallet", shipment);
        const load: any[] = [];
        for (let l = 0; l < 2; l++) for (const [bx, bz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) load.push([bx, 0.146 + l * 0.4, bz]);
        load.push([0, 0.946, 0]);
        load.forEach(([bx, by, bz]) => one(fk, "carton", shipment, { x: bx, y: by, z: bz }));
        truck = one(pk, "delivery_truck", scene, { x: TRUCK_X });
        truckDoor = one(pk, "truck_door", truck, { x: -3.02, y: 3.3 });
      });

      // ---------- camera: one shot per chapter ----------
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      const CAM = [
        V(-8.5, 7.2, 15.5),
        V(SX(1) + 1.45, 1.75, 2.5), V(SX(2) + 1.9, 2.05, 3.9), V(SX(3) + 1.3, 2.9, 3.7), V(SX(4) + 1.2, 3.2, 3.4), V(SX(5) + 1.0, 3.0, 3.0),
        V(SX(6) + 1.9, 2.0, 3.0), V(SX(7) + 1.0, 1.6, 2.6), V(SX(8) + 0.9, 1.95, 1.9), V(SX(9) + 1.0, 2.2, 2.5), V(54.2, 2.9, 3.4),
        V(H.x1 - 3, 6.5, 9.5),
      ];
      const LOOK = [
        V(24, 0.6, -1.5),
        V(SX(1) - 0.05, 1.04, 0), V(SX(2), 0.85, 0.1), V(SX(3), 0.8, -0.1), V(SX(4), 0.8, 0), V(SX(5), 0.86, 0),
        V(SX(6) + 0.6, 1.0, 0), V(SX(7), 1.2, 0), V(SX(8), 0.95, 0.05), V(SX(9), 0.86, 0), V(61.5, 1.2, -0.3),
        V(22, 0.6, -1),
      ];
      const keyAt = (arr: any[], p: number, out: any) => {
        const i = Math.max(0, Math.min(arr.length - 2, Math.floor(p)));
        return out.copy(arr[i]).lerp(arr[i + 1], clamp01(p - i));
      };
      const cam = V(0, 0, 0), look = V(0, 0, 0), tmp = V(0, 0, 0);

      // ---------- post ----------
      let composer: any = null, bloom: any = null;
      if (post) {
        try {
          composer = new THREE.EffectComposer(renderer);
          composer.addPass(new THREE.RenderPass(scene, camera));
          bloom = new THREE.UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 0.55, 0.5, 0.94);
          composer.addPass(bloom);
          composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
        } catch { composer = null; bloom = null; }
      }

      let mx = 0, my = 0, px = 0, py = 0;
      const onMove = (e: PointerEvent) => { mx = (e.clientX / window.innerWidth - 0.5) * 2; my = (e.clientY / window.innerHeight - 0.5) * 2; };
      window.addEventListener("pointermove", onMove);
      let shift = 0;
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        composer?.setSize(w, h);
        camera.aspect = w / h;
        camera.fov = w / h < 1 ? Math.min(64, 36 / Math.max(0.55, w / h)) : 36;
        shift = NaN; // re-applied next frame
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      const onLost = (e: Event) => { e.preventDefault(); setFlat(true); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      let visible = true;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(el);

      const clocks = new Array(N + 1).fill(0);
      const playing = new Array(N + 1).fill(false);
      const uOf = (i: number) => {
        const pin = (window as any).__axProcU; // a fixed frame, for checking the stations by eye
        if (typeof pin === "number") return pin;
        if (still || !playing[i]) return STILL[i];
        const c = clocks[i] % (DUR[i] + 2.2);
        return clamp01(c / DUR[i]);
      };

      let raf = 0, last = performance.now(), t = 0;
      const loop = (ms: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (ms - last) / 1000);
        last = ms;
        if (!visible || document.hidden) return;
        if (!still) t += dt;
        const P: number = (window as any).__axProcess ?? 0;
        const W = el.clientWidth, Hh = el.clientHeight;
        const portrait = W < Hh;

        // camera: hold at each station, travel between
        const cp = camParam(P);
        keyAt(CAM, cp, cam);
        keyAt(LOOK, cp, look);
        if (portrait) {
          // narrower screens: step back along the view so the machine still fits
          tmp.copy(cam).sub(look).multiplyScalar(1.45);
          cam.copy(look).add(tmp);
        }
        if (!still) { px += (mx - px) * 0.04; py += (my - py) * 0.04; }
        camera.position.set(cam.x + px * 0.25, cam.y - py * 0.15, cam.z);
        camera.lookAt(look);
        // keep the machine clear of the text: to the right on wide screens, up on tall ones
        const stepOn = Math.min(1, Math.min(cp, CHAPTERS - 1 - cp));
        const want = Math.round((portrait ? 0.17 * Hh : -0.16 * W) * clamp01(stepOn));
        if (want !== shift) {
          shift = want;
          if (portrait) camera.setViewOffset(W, Hh, 0, want, W, Hh); else camera.setViewOffset(W, Hh, want, 0, W, Hh);
          camera.updateProjectionMatrix();
        }
        // the light follows what we're looking at
        key.target.position.copy(look);
        key.position.copy(look).add(tmp.set(3.5, 8, 6));
        rim.position.copy(look).add(tmp.set(-1.4, 1.6, -1.8));

        // station clocks: the one in front of the camera plays; leaving resets it
        for (let i = 1; i <= N; i++) {
          const d = Math.abs(P - i);
          if (d < 0.3) { playing[i] = true; clocks[i] += dt; } else if (d > 0.75) { playing[i] = false; clocks[i] = 0; }
        }

        // 1 · design
        drawScreen(uOf(1));

        // 2 · print
        {
          const u = uOf(2);
          paperMat.uniforms.uFeed.value = u * 1.45;
          const printing = u > 0.02 && u < 0.98;
          if (printerHead) printerHead.position.x = printing ? Math.sin(t * 6) * 0.98 : 1.0;
        }
        // 3 · heat transfer
        {
          const u = uOf(3);
          (feedIn.material as any).uniforms.uFeed.value = u * 1.5;
          (feedOut.material as any).uniforms.uFeed.value = u * 1.5 - 0.25;
          heat.intensity = (u > 0.02 && u < 0.98 ? 1.4 : 0.6) + (still ? 0 : Math.sin(t * 3) * 0.15);
        }
        // 4 · laser
        {
          const u = uOf(4);
          const c = span(u, 0.08, 0.86);
          const at = pathAt(path, c);
          let [hx, hz] = toBed(at.p);
          if (u < 0.08) { const k = ease(u / 0.08); const [sx, sz] = toBed(path.pts[0]); hx = PARK[0] + (sx - PARK[0]) * k; hz = PARK[1] + (sz - PARK[1]) * k; }
          if (u > 0.86) { const k = ease((u - 0.86) / 0.1); const [ex, ez] = toBed(path.pts[path.pts.length - 1]); hx = ex + (PARK[0] - ex) * k; hz = ez + (PARK[1] - ez) * k; }
          if (gantry) gantry.position.z = hz - 0.08;
          if (laserHead) { laserHead.position.x = hx; laserHead.position.z = hz - 0.08; }
          ribbon.g.setDrawRange(0, u <= 0.08 ? 0 : u >= 0.86 ? ribbon.segEnd[ribbon.segEnd.length - 1] : ribbon.segEnd[Math.max(0, at.i - 1)]);
          const cutting = u > 0.08 && u < 0.86 && path.cut[at.i];
          spark.visible = cutting;
          spark.position.set(hx, BED_Y + 0.01, hz);
          spark.scale.setScalar(0.12 + (still ? 0 : Math.random() * 0.06));
          laserLight.position.set(hx, BED_Y + 0.05, hz);
          laserLight.intensity = cutting ? 0.35 + (still ? 0 : Math.random() * 0.25) : 0;
          // cut free: the pieces lift off the scrap
          const lift = ease((u - 0.88) / 0.08) * 0.012;
          bedPieces.position.y = BED_Y + 0.006 + lift;
        }
        // 5 · QC pieces
        {
          const u = uOf(5);
          const sx = -1.0 + span(u, 0.08, 0.7) * 2.0;
          scanBar.position.x = sx;
          (scanBar.material as any).opacity = 0.65 * (u > 0.06 && u < 0.72 ? 1 : 0);
          PIECES.forEach((p, k) => {
            const px0 = (p.c[0] - SHEET_W / 2) * M_PER_PX * 1.05;
            const on = u >= 0.72 || (u > 0.08 && sx > px0);
            const s = ticks[k];
            const a = s.userData.a = (s.userData.a ?? 0) + ((on ? 1 : 0) - (s.userData.a ?? 0)) * (still ? 1 : Math.min(1, dt * 8));
            s.visible = a > 0.02;
            s.scale.setScalar(0.1 * (0.6 + 0.4 * a));
            (s.material as any).opacity = a;
          });
        }
        // 6 · sewing
        {
          const u = uOf(6);
          sewPieces.children.forEach((m: any, i: number) => {
            const k = ease(span(u, 0.06 + i * 0.09, 0.14 + i * 0.09));
            m.position.set(m.userData.home.x + k * 0.5, m.userData.home.y + Math.sin(k * Math.PI) * 0.05, m.userData.home.z - k * 0.05);
            const s = 1 - k;
            m.scale.setScalar(Math.max(0.001, s));
            m.visible = s > 0.01;
          });
          const sewing = u > 0.05 && u < 0.6;
          needle.position.y = 0.9 + (sewing && !still ? Math.sin(t * 40) * 0.012 : 0);
          const r = span(u, 0.55, 0.85);
          (sewRing.material as any).opacity = Math.sin(r * Math.PI) * 0.9;
          sewRing.scale.setScalar(0.6 + r * 0.8);
          sewRing.position.y = 0.6 + r * 1.0;
        }
        // the shirt: grows on the form at 6, follows the camera to 7, stays there
        if (P > 4.6) loadShirt();
        if (jersey) {
          const holder = (jersey as any).holder;
          const u6 = uOf(6);
          const move = ease((P - 6.25) / 0.5);
          holder.position.copy(FORM6).lerp(FORM7, move);
          holder.position.y += CHEST;
          holder.rotation.y = -0.35 * (1 - move);
          const grow = P < 6.25 ? ease(span(u6, 0.5, 0.82)) : 1;
          holder.scale.setScalar(Math.max(0.001, 0.3 + 0.7 * grow));
          holder.visible = P > 5.3 && grow > 0.001 && P < 8.8;
        }
        // 7 · QC on the form
        {
          const u = uOf(7);
          const pass = span(u, 0.08, 0.62);
          const y = 1.62 - Math.sin(pass * Math.PI) * 0.8;
          qcRing.position.set(0, y, 0.0);
          (qcRing.material as any).opacity = u > 0.06 && u < 0.64 ? 0.9 : 0;
          const a = ease((u - 0.66) / 0.1);
          qcTick.visible = a > 0.01;
          (qcTick.material as any).opacity = a;
          qcTick.scale.setScalar(0.2 * (0.7 + 0.3 * a));
        }
        // 8 · size label
        {
          const u = uOf(8);
          const slide = ease(u / 0.16);
          pressTee.position.set(0, 0.952, 0.62 - 0.5 * slide);
          const close = ease(span(u, 0.2, 0.34)) * (1 - ease(span(u, 0.6, 0.74)));
          if (pressUpper) pressUpper.rotation.x = -1.0 * (1 - close);
          pressGlow.intensity = close > 0.95 ? 1.0 + (still ? 0 : Math.sin(t * 5) * 0.2) : 0;
          const lab = ease(span(u, 0.62, 0.72));
          (label.material as any).opacity = lab;
          label.visible = lab > 0.01;
          label.position.set(0, 0.954, -0.13);
          const steam = span(u, 0.58, 0.95);
          puffs.forEach(s => {
            const k = s.userData.k;
            const f = clamp01(steam * 1.6 - k * 0.09);
            s.visible = f > 0 && f < 1;
            s.position.set(Math.sin(k * 2.1) * 0.22, 1.0 + f * 0.55, 0.04 + Math.cos(k * 1.7) * 0.2);
            s.scale.setScalar(0.05 + f * 0.12);
            (s.material as any).opacity = Math.sin(f * Math.PI) * 0.14;
          });
        }
        // 9 · pack
        {
          const u = uOf(9);
          const sleeves = ease(span(u, 0.06, 0.22));
          const half = ease(span(u, 0.24, 0.38));
          const W0 = 0.6, L0 = 0.64;
          const w = W0 * (1 - 0.42 * sleeves), l = L0 * (1 - 0.5 * half);
          packFlat.scale.set(w, 1, l);
          const thick = 0.004 + 0.03 * half;
          packFlat.position.set(0, thick + 0.002, half * L0 * 0.25);
          folded.scale.set(w * 0.98, thick, l * 0.98);
          folded.position.set(0, thick / 2, half * L0 * 0.25);
          folded.visible = half > 0.02;
          const bagIn = ease(span(u, 0.4, 0.52));
          bag.visible = bagIn > 0.01;
          bag.position.set(-0.5 * (1 - bagIn), 0.025, half * L0 * 0.25);
          (bag.material as any).opacity = 0.32 * bagIn;
          // into the box: up and over, then down
          const go = ease(span(u, 0.55, 0.7));
          const home = { x: -0.42, y: 0.822, z: 0.05 - half * L0 * 0.25 };
          packTee.position.set(home.x + (BOX.x - home.x) * go, home.y + Math.sin(go * Math.PI) * 0.4 + go * (0.012 - 0.0), home.z + (BOX.z - home.z) * go);
          packTee.visible = u < 0.76;
          const sides = ease(span(u, 0.72, 0.8)), ends = ease(span(u, 0.8, 0.88));
          flapsSide.forEach(f => { f.rotation.z = f.userData.sign * -2.0 * (1 - sides); });
          flapsEnd.forEach(f => { f.rotation.x = f.userData.sign * 2.0 * (1 - ends); });
          const tp = ease(span(u, 0.88, 0.95));
          tape.scale.set(Math.max(0.001, BOX.w * 1.02 * tp), 1, 1);
          tape.visible = tp > 0.01;
          const lb = ease(span(u, 0.95, 1));
          (shipLabel.material as any).opacity = lb;
          shipLabel.visible = lb > 0.01;
        }
        // 10 · ship
        {
          const u = uOf(10);
          const roll = ease(span(u, 0.1, 0.42));
          shipment.position.x = 57.4 + roll * (TRUCK_X - 3.0 + 1.6 - 57.4);
          if (truckDoor) {
            const d = ease(span(u, 0.46, 0.6));
            truckDoor.scale.y = Math.max(0.03, d);
          }
          const drive = span(u, 0.64, 1);
          const dx = drive * drive * 46;
          if (truck) truck.position.x = TRUCK_X + dx;
          if (u > 0.42) shipment.position.x += dx;
        }

        // only the stations near the camera are drawn (the overview and the end show them all)
        for (let i = 1; i <= N; i++) st[i].visible = cp < 0.75 || cp > N + 0.25 || Math.abs(cp - i) < 1.6;

        if (composer) composer.render(); else renderer.render(scene, camera);

        // a slow device drops to 1× pixels and no bloom, once
        if (!degraded && dt > 0) {
          frames++; slow += dt;
          if (frames === 90) {
            if (slow / frames > 1 / 30) {
              degraded = true;
              renderer.setPixelRatio(1);
              composer?.renderTarget1?.dispose?.(); composer?.renderTarget2?.dispose?.();
              composer = null; bloom = null;
              fit();
            }
            frames = 0; slow = 0;
          }
        }
      };
      let degraded = false, frames = 0, slow = 0;
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        clearTimeout(idle);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        (jersey as Jersey | null)?.dispose();
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
    const sp = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + (sp * i) / (CHAPTERS - 1) + 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const P = (i: number) => (e: HTMLDivElement | null) => { panels.current[i] = e; };
  const names = [th ? "ภาพรวม" : "Overview", ...STEPS.map(s => (th ? s.th : s.en)), th ? "เริ่มเลย" : "Start"];

  return (
    <section ref={root} className="ax-story ax-proc" style={{ height: `${CHAPTERS * 100}vh` }} aria-label={th ? "ขั้นตอนการผลิตเสื้อ 10 ขั้น" : "How a kit is made, in ten steps"}>
      <div className="ax-story-pin">
        <div ref={mount} className="ax-story-canvas" role="img" aria-label={th ? "สายการผลิตเสื้อแบบ 3D ที่เลื่อนไปตามการเลื่อนหน้า" : "A 3D production line that follows your scroll"} />
        <div className="ax-story-vignette" aria-hidden="true" />
        <div className="ax-story-grain" aria-hidden="true" />

        <div ref={P(0)} className="ax-story-panel hero" data-on>
          <div className="lede">
            <span className="ax-kicker">{th ? "ขั้นตอนผลิต · 10 ขั้น" : "How it's made · 10 steps"}</span>
            <h1 className="ax-display"><Words text={th ? "จากไฟล์\nถึง*มือคุณ" : "From file\nto *your *team"} /></h1>
            <p>{th
              ? "ตามเสื้อหนึ่งตัวผ่านทุกขั้นตอนในโรงงานของเรา ตั้งแต่ไฟล์งานพิมพ์ไปจนถึงขึ้นรถส่งของ"
              : "Follow one shirt through every step in our factory, from the print file to the delivery truck."}</p>
            <div className="ax-row">
              <button type="button" className="ax-story-link" onClick={() => go(1)}>{th ? "เริ่มเดินดูไลน์ผลิต" : "Walk the line"} <span aria-hidden="true">↓</span></button>
            </div>
            {flat && (
              <ol className="ax-proc-list">
                {STEPS.map((s, i) => <li key={s.en}><b>{String(i + 1).padStart(2, "0")}</b> {th ? s.th : s.en}</li>)}
              </ol>
            )}
          </div>
        </div>

        {STEPS.map((s, i) => (
          <div key={s.en} ref={P(i + 1)} className="ax-story-panel left ax-proc-step">
            <span className="no ax-display" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="ax-kicker">{th ? `ขั้นที่ ${i + 1} จาก ${N}` : `Step ${i + 1} of ${N}`} · {s.en}</span>
            <h2 className="ax-display"><Words text={th ? s.h : s.hEn} /></h2>
            <span className="rule" />
            <p>{th ? s.p : s.pEn}</p>
            <ol className="ax-proc-bar" aria-hidden="true">
              {STEPS.map((_, k) => <li key={k} data-done={k < i ? "" : undefined} data-now={k === i ? "" : undefined} />)}
            </ol>
          </div>
        ))}

        <div ref={P(CHAPTERS - 1)} className="ax-story-panel top center">
          <span className="ax-kicker">{th ? "พร้อมแล้ว" : "Your turn"}</span>
          <h2 className="ax-display"><Words text={th ? "ถึงคิว*ทีมคุณ" : "Your *team *next"} /></h2>
          <p>{th ? "ออกแบบเสื้อบนโมเดล 3D แล้วโรงงานจะผลิตตามขั้นตอนทั้ง 10 ขั้นนี้" : "Design your kit in 3D, and the factory makes it through these ten steps."}</p>
          <div className="ax-row" style={{ justifyContent: "center" }}>
            <Link href="/shop" className="ax-btn solid">{th ? "เริ่มออกแบบเสื้อ" : "Start designing"}</Link>
            <Link href="/account" className="ax-btn ghost">{th ? "ติดตามออเดอร์" : "Track my order"}</Link>
          </div>
        </div>

        <nav className="ax-story-nav" aria-label={th ? "ขั้นตอน" : "Steps"}>
          <span className="count ax-mono"><span ref={counter}>00</span> / {String(N).padStart(2, "0")}</span>
          <div className="track" aria-hidden="true"><div ref={bar} className="fill" /></div>
          {names.map((c, i) => (
            <button key={i} type="button" ref={e => { dots.current[i] = e; }} onClick={() => go(i)} aria-label={c}>
              <span>{c}</span>
            </button>
          ))}
        </nav>
      </div>
    </section>
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

/** the designer's screen at progress u: outlines drawn, pieces filled, sent to print */
function drawDesigner(c: HTMLCanvasElement, u: number, th: boolean) {
  const x = c.getContext("2d")!;
  const W = c.width, Hh = c.height;
  x.fillStyle = "#1b1d22"; x.fillRect(0, 0, W, Hh);
  // window chrome
  x.fillStyle = "#25272d"; x.fillRect(0, 0, W, 30);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(16 + i * 18, 15, 5, 0, Math.PI * 2); x.fill(); });
  x.fillStyle = "#a9a7a1"; x.font = '500 13px "Sora", sans-serif'; x.textAlign = "left";
  x.fillText("FB-01_striker_print.ai  ·  1800 × 1080 mm", 76, 20);
  // tools
  x.fillStyle = "#22242a"; x.fillRect(0, 30, 40, Hh - 30);
  for (let i = 0; i < 9; i++) { x.fillStyle = i === (u < 0.45 ? 1 : 3) ? "#f26522" : "#3a3d44"; x.fillRect(10, 44 + i * 30, 20, 20); }
  // layers
  const LX = W - 176;
  x.fillStyle = "#22242a"; x.fillRect(LX, 30, 176, Hh - 30);
  x.fillStyle = "#e8e6e0"; x.font = '600 13px "Sora", sans-serif'; x.fillText(th ? "เลเยอร์" : "Layers", LX + 14, 54);
  const names = ["Front", "Back", "Sleeve L", "Sleeve R", "Collar"];
  names.forEach((n, i) => {
    const on = u > 0.45 + i * 0.07;
    x.fillStyle = on ? "#2f3138" : "#26282e"; x.fillRect(LX + 8, 66 + i * 30, 160, 24);
    x.fillStyle = on ? "#f26522" : "#4a4d55"; x.fillRect(LX + 14, 74 + i * 30, 8, 8);
    x.fillStyle = on ? "#e8e6e0" : "#8d8a84"; x.font = '500 12px "Sora", sans-serif'; x.fillText(n, LX + 30, 82 + i * 30);
  });
  // artboard
  const AX = 56, AY = 46, AW = LX - 72, AH = AW * SHEET_H / SHEET_W;
  x.fillStyle = "#f4f3ef"; x.fillRect(AX, AY, AW, AH);
  x.save();
  x.translate(AX, AY);
  x.scale(AW / SHEET_W, AH / SHEET_H);
  const draw = clamp01(u / 0.45);
  const total = PIECES.length;
  let cursor: [number, number] = [500, 300];
  PIECES.forEach((p, i) => {
    const fill = clamp01((u - 0.45 - i * 0.07) / 0.07);
    if (fill > 0) { x.globalAlpha = fill; paintPiece(x, p, COLORS); x.globalAlpha = 1; if (fill < 1) cursor = p.c; }
    const local = clamp01(draw * total - i);
    if (local > 0) {
      const n = Math.max(2, Math.round(p.pts.length * local));
      x.strokeStyle = "#2f6fd6"; x.lineWidth = 3;
      x.beginPath();
      for (let k = 0; k <= n && k <= p.pts.length; k++) { const q = p.pts[k % p.pts.length]; if (k) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }
      if (local >= 1) { tracePiece(x, p); }
      x.stroke();
      if (local < 1) cursor = p.pts[Math.min(n, p.pts.length - 1)];
    }
  });
  x.restore();
  // export
  const ex = clamp01((u - 0.82) / 0.14);
  const bx = LX + 14, by = Hh - 64;
  if (u > 0.8) cursor = [((bx + 74 - AX) / AW) * SHEET_W, ((by + 18 - AY) / AH) * SHEET_H];
  x.fillStyle = ex > 0 ? "#f26522" : "#3a3d44"; x.fillRect(bx, by, 148, 36);
  x.fillStyle = "#fff"; x.font = '600 13px "Noto Sans Thai", sans-serif'; x.textAlign = "center";
  x.fillText(th ? "ส่งพิมพ์" : "Send to print", bx + 74, by + 23);
  if (ex > 0) {
    x.fillStyle = "#2f3138"; x.fillRect(AX, AY + AH + 14, AW, 8);
    x.fillStyle = "#2aa96b"; x.fillRect(AX, AY + AH + 14, AW * ex, 8);
    x.fillStyle = "#a9a7a1"; x.textAlign = "left"; x.font = '500 12px "Sora", sans-serif';
    x.fillText(ex >= 1 ? "RIP → printer · done" : `RIP → printer · ${Math.round(ex * 100)}%`, AX, AY + AH + 40);
  }
  // pointer
  const cx = AX + cursor[0] * AW / SHEET_W, cy = AY + cursor[1] * AH / SHEET_H;
  x.fillStyle = "#fff"; x.strokeStyle = "#111"; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + 18); x.lineTo(cx + 5, cy + 13); x.lineTo(cx + 12, cy + 13); x.closePath(); x.fill(); x.stroke();
}

/** the side monitor: the brief — colours, the reference shirt, sizes */
function drawReference(x: CanvasRenderingContext2D, W: number, H: number) {
  x.fillStyle = "#1b1d22"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#25272d"; x.fillRect(0, 0, W, 26);
  x.fillStyle = "#a9a7a1"; x.font = '500 12px "Sora", sans-serif'; x.fillText("brief_FB-01.pdf", 12, 17);
  const sw = [COLORS.body, COLORS.sleeve, COLORS.stripe, COLORS.trim];
  sw.forEach((c, i) => { x.fillStyle = c; x.fillRect(16 + i * 58, 44, 48, 48); });
  x.fillStyle = "#e8e6e0"; x.font = '600 13px "Sora", sans-serif'; x.fillText("ROYAL · BLACK · FLARE", 16, 116);
  x.fillStyle = "#8d8a84"; x.font = '500 12px "Sora", sans-serif';
  ["S × 4   M × 8   L × 6   XL × 2", "Names + numbers: 20", "Fabric: Mesh"].forEach((l, i) => x.fillText(l, 16, 146 + i * 22));
  // the reference shirt
  const cx = W - 120, cy = 150;
  x.fillStyle = COLORS.sleeve;
  x.beginPath(); x.moveTo(cx - 60, cy - 80); x.lineTo(cx - 100, cy - 30); x.lineTo(cx - 76, cy - 10); x.lineTo(cx - 56, cy - 34); x.lineTo(cx + 56, cy - 34); x.lineTo(cx + 76, cy - 10); x.lineTo(cx + 100, cy - 30); x.lineTo(cx + 60, cy - 80); x.closePath(); x.fill();
  x.fillStyle = COLORS.body; x.fillRect(cx - 56, cy - 80, 112, 190);
  x.save(); x.beginPath(); x.rect(cx - 56, cy - 80, 112, 190); x.clip();
  x.translate(cx, cy); x.rotate(-0.5); x.fillStyle = COLORS.stripe; x.fillRect(-120, -12, 240, 24); x.restore();
  x.fillStyle = COLORS.trim; x.beginPath(); x.moveTo(cx - 22, cy - 80); x.lineTo(cx, cy - 52); x.lineTo(cx + 22, cy - 80); x.closePath(); x.fill();
}
