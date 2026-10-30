"use client";

import { useEffect, useRef, useState } from "react";
import { loadThreeWithGltf, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey, type JerseyLook } from "../lib/jersey3d";
import type { Kit } from "../lib/kits";
import KitThumb from "./KitThumb";

export type Size = "S" | "M" | "L" | "XL";
export type CheckoutPhase = "build" | "pack" | "sent";

const SIZES: Size[] = ["S", "M", "L", "XL"];
/** folded shirts drawn per size column; the label carries the real count */
const MAX_PER_STACK = 18;
const SHIRT_H = 0.085;
const STACK_X = [-2.1, -0.7, 0.7, 2.1];
const STACK_Z = 1.25;
const BOX = { w: 3.0, h: 1.35, d: 2.1, y: 0, z: 0.55 };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIn = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * The 3D side of checkout.
 *
 * build — the team's kit turns on a lit pedestal; in front of it every shirt
 *         in the order is a folded tee on its size stack, dropping in as the
 *         quantities change.
 * pack  — the order is placed: a carton rises, the stacks fly into it one by
 *         one, the hero shirt folds in last, the flaps close and the carton
 *         is taped and labelled with the order number.
 * sent  — payment confirmed: the carton slides off toward production.
 */
export default function CheckoutScene({
  kit, look, counts, phase, label,
}: {
  kit: Kit;
  look: JerseyLook;
  counts: Record<Size, number>;
  phase: CheckoutPhase;
  /** printed on the carton once packed (the order number) */
  label?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [flat, setFlat] = useState(false);
  const api = useRef<{ setLook(l: JerseyLook): void; setCounts(c: Record<Size, number>): void; setPhase(p: CheckoutPhase, label?: string): void } | null>(null);
  const latest = useRef({ look, counts, phase, label });
  latest.current = { look, counts, phase, label };

  useEffect(() => { api.current?.setLook(look); }, [look]);
  useEffect(() => { api.current?.setCounts(counts); }, [counts]);
  useEffect(() => { api.current?.setPhase(phase, label); }, [phase, label]);

  useEffect(() => {
    if (!hasWebGL()) { setFlat(true); return; }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    loadThreeWithGltf().then(async (THREE: any) => {
      const jersey = await loadJersey(THREE, kit);
      if (disposed || !mount.current) { jersey.dispose(); return; }
      const el = mount.current;
      const trash: any[] = [];
      const keep = <T,>(o: T) => { trash.push(o); return o; };
      const still = prefersReducedMotion();

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f1012);
      scene.fog = new THREE.Fog(0x0f1012, 14, 30);
      const camera = new THREE.PerspectiveCamera(36, el.clientWidth / el.clientHeight, 0.1, 80);
      const CAM_BUILD = new THREE.Vector3(0, 3.1, 10.2);
      const CAM_PACK = new THREE.Vector3(2.2, 5.4, 10.6);
      const LOOK_BUILD = new THREE.Vector3(0, 1.45, 0.4);
      const LOOK_PACK = new THREE.Vector3(0, 0.55, 0.5);
      camera.position.copy(CAM_BUILD);
      const lookAt = LOOK_BUILD.clone();

      // ---------- floor + pedestal ----------
      const floorTex = keep(canvasTex(THREE, 512, 512, x => {
        const g = x.createRadialGradient(256, 256, 10, 256, 256, 256);
        g.addColorStop(0, "#26282c"); g.addColorStop(0.55, "#16181b"); g.addColorStop(1, "#0f1012");
        x.fillStyle = g; x.fillRect(0, 0, 512, 512);
        x.strokeStyle = "rgba(242,240,235,.07)"; x.lineWidth = 2;
        for (let r = 60; r < 256; r += 48) { x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.stroke(); }
      }));
      const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(14, 64)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0xf26522 }));
      const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(1.35, 0.025, 8, 96)), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.02, -0.6);
      scene.add(ring);
      const glow = new THREE.Mesh(keep(new THREE.CircleGeometry(1.35, 64)), keep(new THREE.MeshBasicMaterial({ color: 0xf26522, transparent: true, opacity: 0.07, depthWrite: false })));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(0, 0.015, -0.6);
      scene.add(glow);

      // ---------- lights ----------
      scene.add(new THREE.HemisphereLight(0xf2efe8, 0x1a1512, 0.55));
      const key = new THREE.SpotLight(0xffffff, 1.7, 40, 0.6, 0.6, 1.2);
      key.position.set(3, 9, 7);
      key.target.position.set(0, 0.6, 0.4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0008;
      scene.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xbfcde6, 0.45); fill.position.set(-6, 3, 5); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xff8a4c, 0.8); rim.position.set(-3, 4, -6); scene.add(rim);

      // ---------- hero shirt ----------
      const hero = new THREE.Group();
      const JERSEY_SCALE = 0.62;
      jersey.group.scale.setScalar(JERSEY_SCALE);
      jersey.group.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
      hero.add(jersey.group);
      hero.position.set(0, 2.05, -0.6);
      scene.add(hero);

      // ---------- folded shirts ----------
      const foldCanvas = document.createElement("canvas");
      foldCanvas.width = 256; foldCanvas.height = 192;
      const foldTex = keep(new THREE.CanvasTexture(foldCanvas));
      foldTex.encoding = THREE.sRGBEncoding;
      const topMat = keep(new THREE.MeshStandardMaterial({ map: foldTex, roughness: 0.85 }));
      const sideMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
      const foldGeo = keep(new THREE.BoxGeometry(1.0, SHIRT_H * 0.9, 0.74));
      // box faces: +x, -x, +y (top), -y, +z, -z
      const foldMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

      const drawFold = (l: JerseyLook) => {
        const x = foldCanvas.getContext("2d")!;
        const c = l.colors;
        x.fillStyle = c.body; x.fillRect(0, 0, 256, 192);
        // a folded tee seen from above: shoulders, collar, sleeve folds
        x.fillStyle = shade(c.body, -0.12);
        x.fillRect(0, 0, 18, 192); x.fillRect(238, 0, 18, 192);
        if (kit.cut.sleeves !== "none") {
          x.fillStyle = c.sleeve;
          x.fillRect(0, 10, 30, 70); x.fillRect(226, 10, 30, 70);
        }
        x.fillStyle = c.trim;
        x.beginPath();
        if (kit.garment === "shorts" || kit.garment === "pants") {
          // folded shorts: the waistband across the top, the drawcord at the front
          x.rect(0, 0, 256, 30);
          x.fill();
          x.strokeStyle = c.number; x.lineWidth = 4; x.lineCap = "round";
          x.beginPath(); x.moveTo(122, 18); x.lineTo(112, 58); x.moveTo(134, 18); x.lineTo(146, 54); x.stroke();
        } else if (kit.garment === "hoodie") {
          // the hood folded down over the back, its edge in the trim colour
          x.fillStyle = shade(c.body, -0.18);
          x.ellipse(128, 0, 64, 44, 0, 0, Math.PI); x.fill();
          x.strokeStyle = c.trim; x.lineWidth = 6;
          x.beginPath(); x.ellipse(128, 0, 40, 26, 0, 0, Math.PI); x.stroke();
          x.fillStyle = c.trim; x.fillRect(0, 176, 256, 16);
        } else {
          if (kit.cut.neck === "v") { x.moveTo(98, 0); x.lineTo(128, 46); x.lineTo(158, 0); x.lineTo(146, 0); x.lineTo(128, 28); x.lineTo(110, 0); }
          else { x.ellipse(128, 0, 34, 26, 0, 0, Math.PI); }
          x.fill();
        }
        if (l.number) {
          x.fillStyle = c.number;
          x.font = '400 64px "Anton", sans-serif';
          x.textAlign = "center"; x.textBaseline = "middle";
          x.fillText(l.number, 128, 116);
        }
        x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(0, 186, 256, 6); // fold edge
        foldTex.needsUpdate = true;
        sideMat.color.copy(new THREE.Color(c.body).convertSRGBToLinear());
      };

      interface Shirt { mesh: any; size: Size; idx: number; born: number; leaving: number; from?: any; to?: any; flyAt?: number }
      const shirts: Shirt[] = [];
      const stackCount: Record<Size, number> = { S: 0, M: 0, L: 0, XL: 0 };
      const want: Record<Size, number> = { S: 0, M: 0, L: 0, XL: 0 };
      const realCount: Record<Size, number> = { S: 0, M: 0, L: 0, XL: 0 };

      // size labels on the floor in front of each stack
      const labels: Record<Size, { canvas: HTMLCanvasElement; tex: any; mesh: any }> = {} as any;
      SIZES.forEach((s, i) => {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 96;
        const tex = keep(new THREE.CanvasTexture(canvas));
        tex.encoding = THREE.sRGBEncoding;
        const mesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.25, 0.47)), keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(STACK_X[i], 0.02, STACK_Z + 0.72);
        scene.add(mesh);
        labels[s] = { canvas, tex, mesh };
      });
      const drawLabel = (s: Size) => {
        const { canvas, tex } = labels[s];
        const x = canvas.getContext("2d")!;
        x.clearRect(0, 0, 256, 96);
        const n = realCount[s];
        x.fillStyle = "rgba(15,16,18,.72)"; x.fillRect(0, 8, 256, 80);
        x.fillStyle = n ? "#f2f0eb" : "rgba(242,240,235,.4)";
        x.font = '400 54px "Anton", sans-serif';
        x.textAlign = "left"; x.textBaseline = "middle";
        x.fillText(s, 18, 50);
        x.font = '600 30px ui-monospace, Menlo, monospace';
        x.textAlign = "right";
        x.fillStyle = n ? "#f26522" : "rgba(242,240,235,.35)";
        x.fillText(`× ${n}`, 242, 52);
        tex.needsUpdate = true;
      };

      let now = 0;
      const stackPos = (s: Size, idx: number) => {
        const i = SIZES.indexOf(s);
        // a slight hand-stacked wobble, the same every time for the same slot
        const j = Math.sin(idx * 12.9898 + i * 78.233) * 43758.5453;
        const r = j - Math.floor(j);
        return new THREE.Vector3(STACK_X[i] + (r - 0.5) * 0.06, SHIRT_H / 2 + idx * SHIRT_H, STACK_Z + (r - 0.5) * 0.05);
      };
      const syncStacks = () => {
        for (const s of SIZES) {
          const target = Math.min(MAX_PER_STACK, want[s]);
          while (stackCount[s] < target) {
            const idx = stackCount[s]++;
            const mesh = new THREE.Mesh(foldGeo, foldMats);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.position.copy(stackPos(s, idx));
            scene.add(mesh);
            // a burst of new shirts lands one after another, not all at once
            const queued = shirts.filter(x => x.size === s && now - x.born < 0).length;
            shirts.push({ mesh, size: s, idx, born: now + (still ? -1 : queued * 0.05), leaving: 0 });
          }
          while (stackCount[s] > target) {
            stackCount[s]--;
            const top = shirts.filter(x => x.size === s && !x.leaving).sort((a, b) => b.idx - a.idx)[0];
            if (top) top.leaving = now;
          }
        }
      };

      // ---------- carton ----------
      const cardTex = keep(canvasTex(THREE, 256, 256, x => {
        x.fillStyle = "#b98a57"; x.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 2600; i++) {
          const v = Math.random() * 30 - 15;
          x.fillStyle = `rgba(${120 + v},${85 + v},${50 + v},.18)`;
          x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1);
        }
      }));
      const cardMat = keep(new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.92 }));
      const cardInner = keep(new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.95 }));
      const carton = new THREE.Group();
      carton.position.set(0, BOX.y, BOX.z);
      const T = 0.04;
      const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), [cardMat, cardMat, cardInner, cardMat, cardMat, cardMat]);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true;
        carton.add(m);
        return m;
      };
      part(BOX.w, T, BOX.d, 0, T / 2, 0);
      part(BOX.w, BOX.h, T, 0, BOX.h / 2, BOX.d / 2);
      part(BOX.w, BOX.h, T, 0, BOX.h / 2, -BOX.d / 2);
      part(T, BOX.h, BOX.d, BOX.w / 2, BOX.h / 2, 0);
      part(T, BOX.h, BOX.d, -BOX.w / 2, BOX.h / 2, 0);
      // flaps hinge on the top edges and open outward; the short side flaps
      // close first, then the long back and front ones lie on top of them
      const flaps: { pivot: any; axis: "x" | "z"; open: number; delay: number }[] = [];
      const flap = (axis: "x" | "z", sign: number, delay: number, lift: number) => {
        const pivot = new THREE.Group();
        const long = axis === "x";
        const w = long ? BOX.w * 0.98 : BOX.w / 2 - 0.02;
        const d = long ? BOX.d / 2 - 0.01 : BOX.d * 0.96;
        pivot.position.set(long ? 0 : -sign * BOX.w / 2, BOX.h + lift, long ? -sign * BOX.d / 2 : 0);
        const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, T * 0.8, d)), [cardMat, cardMat, cardMat, cardInner, cardMat, cardMat]);
        m.castShadow = true;
        // closed (rotation 0) the flap lies flat, reaching from its hinge to the middle
        if (long) m.position.set(0, 0, sign * d / 2); else m.position.set(sign * w / 2, 0, 0);
        pivot.add(m);
        carton.add(pivot);
        const open = sign * 2.2;
        if (long) pivot.rotation.x = open; else pivot.rotation.z = open;
        flaps.push({ pivot, axis, open, delay });
      };
      flap("z", 1, 0.0, 0); // left
      flap("z", -1, 0.0, 0); // right
      flap("x", 1, 0.25, T * 0.85); // back
      flap("x", -1, 0.42, T * 0.85); // front

      const tape = new THREE.Mesh(keep(new THREE.BoxGeometry(BOX.w + 0.02, 0.012, 0.32)), keep(new THREE.MeshStandardMaterial({ color: 0xf26522, roughness: 0.4 })));
      tape.position.set(0, BOX.h + T * 1.7 + 0.006, 0);
      tape.scale.x = 0.0001;
      carton.add(tape);
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512; labelCanvas.height = 256;
      const labelTex = keep(new THREE.CanvasTexture(labelCanvas));
      labelTex.encoding = THREE.sRGBEncoding;
      const stamp = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.5, 0.75)), keep(new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.8 })));
      stamp.position.set(0.55, BOX.h * 0.52, BOX.d / 2 + T / 2 + 0.003);
      stamp.visible = false;
      carton.add(stamp);
      const drawStamp = (text: string) => {
        const x = labelCanvas.getContext("2d")!;
        x.clearRect(0, 0, 512, 256);
        x.fillStyle = "#f2f0eb"; x.fillRect(8, 8, 496, 240);
        x.strokeStyle = "#141619"; x.lineWidth = 6; x.strokeRect(20, 20, 472, 216);
        x.fillStyle = "#141619";
        x.font = '400 64px "Anton", sans-serif'; x.textBaseline = "middle";
        x.fillText("AXIOM.", 44, 78);
        x.fillStyle = "#f26522"; x.fillRect(44, 118, 60, 6);
        x.fillStyle = "#141619";
        x.font = '600 34px ui-monospace, Menlo, monospace';
        x.fillText(text || "ORDER", 44, 172);
        x.font = '600 22px ui-monospace, Menlo, monospace';
        x.fillText(`${kit.code} · ${Object.values(realCount).reduce((a, b) => a + b, 0)} PCS`, 44, 212);
        labelTex.needsUpdate = true;
      };
      carton.scale.setScalar(0.0001);
      carton.visible = false;
      scene.add(carton);

      // ---------- state ----------
      let phase: CheckoutPhase = "build";
      let phaseAt = 0;
      let packPlanned = false;
      let packEnd = 0;

      const setLook = (l: JerseyLook) => { jersey.setLook(l); drawFold(l); };
      const setCounts = (c: Record<Size, number>) => {
        for (const s of SIZES) { want[s] = Math.max(0, c[s] || 0); realCount[s] = want[s]; drawLabel(s); }
        if (phase === "build") syncStacks();
      };
      const planPack = () => {
        // every shirt still on a stack flies into the carton in a row, top ones first
        const flying = shirts.filter(x => !x.leaving).sort((a, b) => b.idx - a.idx || SIZES.indexOf(a.size) - SIZES.indexOf(b.size));
        const n = flying.length;
        const span = Math.min(1.6, 0.06 * n);
        const per = n > 1 ? span / (n - 1) : 0;
        // inside the carton: 4 columns, one per size
        const layer: Record<Size, number> = { S: 0, M: 0, L: 0, XL: 0 };
        flying.forEach((x, k) => {
          const col = SIZES.indexOf(x.size);
          const lx = (col - 1.5) * 0.68;
          const ly = T + SHIRT_H / 2 + layer[x.size]++ * SHIRT_H * 0.6;
          x.from = x.mesh.position.clone();
          x.to = new THREE.Vector3(lx, BOX.y + ly, BOX.z);
          x.flyAt = 0.75 + k * per;
        });
        packEnd = 0.75 + span + 0.7;
        packPlanned = true;
      };
      const setPhase = (p: CheckoutPhase, text?: string) => {
        if (p === phase) { if (text) drawStamp(text); return; }
        if (p === "pack" || p === "sent") {
          if (phase === "build") { planPack(); carton.visible = true; }
          drawStamp(text ?? "");
        }
        phase = p;
        phaseAt = now;
        if (still) phaseAt = now - 100; // jump straight to the end state
      };
      api.current = { setLook, setCounts, setPhase };

      setLook(latest.current.look);
      setCounts(latest.current.counts);
      if (latest.current.phase !== "build") setPhase(latest.current.phase, latest.current.label);

      // ---------- drag to turn the hero ----------
      let spin = 0;
      let drag: { x: number; a: number } | null = null;
      const onDown = (e: PointerEvent) => { drag = { x: e.clientX, a: spin }; };
      const onMove = (e: PointerEvent) => { if (drag) spin = drag.a + (e.clientX - drag.x) * 0.01; };
      const onUp = () => { drag = null; };
      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      renderer.domElement.style.touchAction = "pan-y";

      const onLost = (e: Event) => { e.preventDefault(); setFlat(true); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        // keep all four stacks in frame on narrow screens
        camera.fov = w / h < 1 ? 36 / Math.max(0.6, w / h) : 36;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      let visible = true;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(el);

      const heroHome = hero.position.clone();
      let raf = 0;
      let last = performance.now();
      const loop = (ms: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (ms - last) / 1000);
        last = ms;
        now += dt;
        if (!visible || document.hidden) return;
        const t = now - phaseAt;

        // stacks: land, or leave from the top
        for (let i = shirts.length - 1; i >= 0; i--) {
          const x = shirts[i];
          const home = stackPos(x.size, x.idx);
          if (phase === "build" || !packPlanned || x.flyAt === undefined) {
            if (x.leaving) {
              const k = clamp01((now - x.leaving) / 0.25);
              x.mesh.position.set(home.x, home.y + k * 0.6, home.z);
              x.mesh.scale.setScalar(1 - k);
              if (k >= 1) { scene.remove(x.mesh); shirts.splice(i, 1); }
              continue;
            }
            const k = clamp01((now - x.born) / 0.45);
            x.mesh.position.set(home.x, home.y + (1 - ease(k)) * 3.2, home.z);
            x.mesh.rotation.y = (1 - ease(k)) * 0.6;
            x.mesh.visible = k > 0;
          } else {
            const k = ease(clamp01((t - x.flyAt) / 0.55));
            if (x.leaving) { x.mesh.visible = false; continue; }
            const p = x.from.clone().lerp(x.to, k);
            p.y += Math.sin(k * Math.PI) * 1.6;
            x.mesh.position.copy(p);
            x.mesh.rotation.y = Math.sin(k * Math.PI) * 0.5 * (x.idx % 2 ? 1 : -1);
            x.mesh.scale.set(1 - k * 0.42, 1, 1 - k * 0.2);
          }
        }

        // hero shirt
        if (!drag && phase === "build" && !still) spin += dt * 0.45;
        if (phase === "build") {
          hero.position.y = heroHome.y + (still ? 0 : Math.sin(now * 1.1) * 0.06);
          hero.rotation.y += (spin - hero.rotation.y) * (1 - Math.exp(-dt * 7));
          hero.scale.setScalar(1);
        } else {
          // folds flat and drops in after the stacks
          const k = ease(clamp01((t - (packEnd - 0.65)) / 0.6));
          hero.rotation.y += (Math.round(hero.rotation.y / (Math.PI * 2)) * Math.PI * 2 - hero.rotation.y) * (1 - Math.exp(-dt * 5));
          hero.rotation.x = -k * Math.PI / 2;
          hero.position.set(0, heroHome.y + (BOX.y + BOX.h * 0.55 - heroHome.y) * k, heroHome.z + (BOX.z - heroHome.z) * k);
          hero.scale.set(1 - k * 0.45, 1 - k * 0.45, Math.max(0.05, 1 - k));
          hero.visible = k < 0.98;
        }

        // carton
        if (phase !== "build") {
          const rise = ease(clamp01(t / 0.6));
          carton.scale.setScalar(Math.max(0.0001, rise));
          const close = packEnd + 0.1;
          for (const f of flaps) {
            const k = ease(clamp01((t - close - f.delay) / 0.45));
            const a = f.open * (1 - k);
            if (f.axis === "x") f.pivot.rotation.x = a; else f.pivot.rotation.z = a;
          }
          const tk = ease(clamp01((t - close - 0.95) / 0.4));
          tape.scale.x = Math.max(0.0001, tk);
          stamp.visible = t > close + 1.2;
          // the stacks of folded shirts disappear once the lid is shut
          if (t > close + 0.6) for (const x of shirts) x.mesh.visible = false;
          ring.position.z += (BOX.z - ring.position.z) * (1 - Math.exp(-dt * 3));
          glow.position.z = ring.position.z;
          for (const s of SIZES) labels[s].mesh.visible = false;
        }
        if (phase === "sent") {
          const k = easeIn(clamp01((t - 0.3) / 1.4));
          carton.position.x = k * 9;
          carton.position.y = BOX.y + Math.sin(clamp01(t / 0.3) * Math.PI) * 0.12;
          carton.rotation.y = -k * 0.2;
          ringMat.color.lerp(new THREE.Color(0x7fd6a0), 1 - Math.exp(-dt * 2));
        }

        // camera eases toward the carton once packing starts
        const camGoal = phase === "build" ? CAM_BUILD : CAM_PACK;
        const lookGoal = phase === "build" ? LOOK_BUILD : LOOK_PACK;
        const ck = still ? 1 : 1 - Math.exp(-dt * 1.6);
        camera.position.lerp(camGoal, ck);
        lookAt.lerp(lookGoal, ck);
        camera.lookAt(lookAt);
        ring.scale.setScalar(1 + (still ? 0 : Math.sin(now * 2.2) * 0.015));

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        api.current = null;
        jersey.dispose();
        for (const t2 of trash) t2.dispose?.();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => setFlat(true));

    return () => { disposed = true; cleanup?.(); };
  }, [kit]);

  if (flat) {
    const total = SIZES.reduce((n, s) => n + (counts[s] || 0), 0);
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <KitThumb kit={kit} colors={look.colors} pattern={look.pattern} number={look.number} label={kit.name} style={{ width: "min(40%, 320px)" }} />
        <p className="ax-mono" style={{ fontSize: 13 }}>{phase === "build" ? `${total} ตัว` : phase === "pack" ? `แพ็กลงกล่องแล้ว · ${label ?? ""}` : "ส่งเข้าคิวผลิตแล้ว"}</p>
      </div>
    );
  }
  return <div ref={mount} style={{ position: "absolute", inset: 0, cursor: "grab" }} role="img" aria-label={`เสื้อ ${kit.name} ที่กำลังสั่งผลิต ${SIZES.map(s => `${s} ${counts[s] || 0} ตัว`).join(" ")}`} />;
}

function canvasTex(THREE: any, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/** lighten (amt > 0) or darken (amt < 0) a #rrggbb colour */
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
