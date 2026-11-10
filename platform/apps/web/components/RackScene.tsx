"use client";

import { useEffect, useRef, useState } from "react";
import { loadThreeWithGltf, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey } from "../lib/jersey3d";
import { defaultConfig, type Kit } from "../lib/kits";

/**
 * The /shop rack: every kit hangs on one rail. The selected one swings to face
 * the front and the camera slides to it; the rest turn side-on like shirts on
 * a real rail. Clicking a shirt selects it, clicking the selected one opens it.
 */
export default function RackScene({
  kits, index, onSelect, onOpen, onFail,
}: {
  kits: Kit[];
  index: number;
  onSelect: (i: number) => void;
  onOpen: (i: number) => void;
  onFail: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const cb = useRef({ onSelect, onOpen, onFail });
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  indexRef.current = index;
  cb.current = { onSelect, onOpen, onFail };

  useEffect(() => {
    if (!hasWebGL()) { cb.current.onFail(); return; }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    loadThreeWithGltf().then(async (THREE: any) => {
      const built = await Promise.all(kits.map(k => loadJersey(THREE, k, { hanger: true, textureSize: 512 })));
      if (disposed || !mount.current) { built.forEach(j => j.dispose()); return; }
      const el = mount.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.1, 100);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x302822, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 7); scene.add(key);
      const back = new THREE.DirectionalLight(0xffffff, 0.55); back.position.set(-4, 2, -6); scene.add(back);

      const GAP = 3.2;
      const railY = 2.55;
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, GAP * (kits.length + 6), 16),
        new THREE.MeshStandardMaterial({ color: 0x8e939a, metalness: 0.85, roughness: 0.3 }),
      );
      rail.rotation.z = Math.PI / 2;
      rail.position.set(GAP * (kits.length - 1) / 2, railY, -0.2);
      scene.add(rail);

      const jerseys = kits.map((k, i) => {
        const j = built[i];
        const c = defaultConfig(k);
        j.setLook({ colors: c.colors, pattern: c.pattern, trim: c.trim, fabric: c.fabric, name: "", number: c.number, font: "block" });
        const holder = new THREE.Group();
        holder.add(j.group);
        // hang the hook on the rail
        if (typeof j.hookTop === "number") {
          j.group.position.y = railY - j.hookTop;
          j.group.position.z = -0.2 - (j.hookZ ?? 0);
        } else {
          j.group.position.y = railY - (j.top + 0.62) - 0.02;
        }
        holder.position.x = i * GAP;
        holder.userData.index = i;
        j.group.traverse((o: any) => { o.userData.index = i; });
        scene.add(holder);
        return { j, holder };
      });

      const still = prefersReducedMotion();
      const camX = { v: indexRef.current * GAP };
      const ray = new THREE.Raycaster();
      const ptr = new THREE.Vector2();
      const pick = (e: PointerEvent): number | null => {
        const r = renderer.domElement.getBoundingClientRect();
        ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ptr, camera);
        const hit = ray.intersectObjects(jerseys.map(x => x.holder), true)[0];
        return hit ? hit.object.userData.index ?? null : null;
      };
      let downAt: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { downAt = null; return; }
        downAt = null;
        const i = pick(e);
        if (i === null) return;
        if (i === indexRef.current) cb.current.onOpen(i);
        else cb.current.onSelect(i);
      };
      const onMove = (e: PointerEvent) => {
        const i = pick(e);
        renderer.domElement.style.cursor = i === null ? "default" : "pointer";
        const r = el.getBoundingClientRect();
        setHover(i === null ? null : { x: e.clientX - r.left, y: e.clientY - r.top, i });
      };
      const onLeave = () => setHover(null);
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerleave", onLeave);

      const onLost = (e: Event) => { e.preventDefault(); cb.current.onFail(); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        // pull back on narrow screens so the selected shirt still fits
        camera.position.z = w / h < 1 ? 15.5 : 11.5;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      let raf = 0;
      const t0 = performance.now();
      let last = t0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (document.hidden) return;
        const t = (now - t0) / 1000;
        const ease = still ? 1 : 1 - Math.exp(-dt * 4.5);
        const sel = indexRef.current;
        camX.v += (sel * GAP - camX.v) * ease;
        camera.position.x = camX.v;
        camera.position.y = 0.35;
        camera.lookAt(camX.v, 0.15, 0);
        jerseys.forEach(({ holder }, i) => {
          const on = i === sel;
          const targetRot = on ? (still ? 0 : Math.sin(t * 0.7) * 0.28) : (i < sel ? 1.12 : -1.12);
          const targetZ = on ? 0.9 : -0.35;
          const targetS = on ? 1.08 : 0.9;
          holder.rotation.y += (targetRot - holder.rotation.y) * ease;
          holder.position.z += (targetZ - holder.position.z) * ease;
          const s = holder.scale.x + (targetS - holder.scale.x) * ease;
          holder.scale.setScalar(s);
        });
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerleave", onLeave);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        jerseys.forEach(({ j }) => j.dispose());
        rail.geometry.dispose();
        rail.material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => cb.current.onFail());

    return () => { disposed = true; cleanup?.(); };
  }, [kits]);

  return (
    <div ref={mount} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
      {hover && (
        <div
          style={{
            position: "absolute", left: hover.x + 16, top: hover.y + 18, pointerEvents: "none",
            padding: "8px 12px", background: "rgba(242,240,235,.94)", color: "#15161a",
            fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, letterSpacing: "0.12em", lineHeight: 1.5,
            textTransform: "uppercase", whiteSpace: "nowrap",
          }}
        >
          {kits[hover.i].code}<br />
          <b style={{ fontFamily: "'Noto Sans Thai', sans-serif", fontSize: 13, letterSpacing: 0, textTransform: "none" }}>
            {kits[hover.i].name}{hover.i === index ? " — คลิกเพื่อออกแบบ" : ""}
          </b>
        </div>
      )}
    </div>
  );
}
