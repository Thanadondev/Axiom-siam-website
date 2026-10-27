"use client";

import { useEffect, useRef, useState } from "react";
import { loadThreeWithGltf, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey, type JerseyLook } from "../lib/jersey3d";
import type { Kit } from "../lib/kits";
import KitThumb from "./KitThumb";

/**
 * The landing-page hero: one kit turning slowly on a transparent stage.
 * Drag turns it by hand; it settles back into the slow spin when released.
 * Falls back to the flat drawing when WebGL is missing or the context is lost.
 */
export default function JerseyStage({ kit, look }: { kit: Kit; look: JerseyLook }) {
  const mount = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  const apply = useRef<((l: JerseyLook) => void) | null>(null);
  const [fallback, setFallback] = useState(false);

  lookRef.current = look;
  useEffect(() => { apply.current?.(look); }, [look]);

  useEffect(() => {
    if (!hasWebGL()) { setFallback(true); return; }
    let disposed = false;
    let cleanup: (() => void) | null = null;

    loadThreeWithGltf().then(async (THREE: any) => {
      const jersey = await loadJersey(THREE, kit);
      if (disposed || !mount.current) { jersey.dispose(); return; }
      const el = mount.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = "pan-y";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 100);
      camera.position.set(0, 0.1, 9.4);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2420, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3, 4, 6); scene.add(key);
      const rim = new THREE.DirectionalLight(0xff8a4c, 1.2); rim.position.set(-5, 2, -4); scene.add(rim);
      const rim2 = new THREE.DirectionalLight(0x9db7ff, 0.6); rim2.position.set(5, -1, -3); scene.add(rim2);

      jersey.group.position.y = 0.05;
      scene.add(jersey.group);
      jersey.setLook(lookRef.current);
      apply.current = l => jersey.setLook(l);

      const still = prefersReducedMotion();
      let angle = -0.5;
      let tilt = 0;
      let drag: { x: number; a: number } | null = null;
      let visible = true;

      const onDown = (e: PointerEvent) => { drag = { x: e.clientX, a: angle }; };
      const onMove = (e: PointerEvent) => {
        if (drag) angle = drag.a + (e.clientX - drag.x) * 0.01;
        const r = el.getBoundingClientRect();
        tilt = ((e.clientY - r.top) / r.height - 0.5) * 0.25;
      };
      const onUp = () => { drag = null; };
      renderer.domElement.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(el);

      const onLost = (e: Event) => { e.preventDefault(); setFallback(true); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      let raf = 0;
      let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!visible || document.hidden) return;
        if (!drag && !still) angle += dt * 0.35;
        jersey.group.rotation.y += (angle - jersey.group.rotation.y) * (1 - Math.exp(-dt * 7));
        jersey.group.rotation.x += (tilt - jersey.group.rotation.x) * (1 - Math.exp(-dt * 3));
        if (!still) jersey.group.position.y = 0.05 + Math.sin(now * 0.0009) * 0.06;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      const onResize = () => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(el);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        apply.current = null;
        jersey.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => setFallback(true));

    return () => { disposed = true; cleanup?.(); };
  }, [kit]);

  if (fallback) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <KitThumb kit={kit} colors={look.colors} pattern={look.pattern} number={look.number} label={kit.name} style={{ width: "60%", maxWidth: 380 }} />
      </div>
    );
  }
  return <div ref={mount} style={{ position: "absolute", inset: 0, cursor: "grab" }} role="img" aria-label={`โมเดล 3D ${kit.name} ลากเพื่อหมุน`} />;
}
