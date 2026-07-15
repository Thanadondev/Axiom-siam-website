"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-reactive Three.js wireframe scene (r128 from CDN) — the "point cloud
 * of trucks in the yard" effect from the reference video, adapted to a field
 * of wireframe jersey shapes drifting through fog.
 *
 * `progress` (0..1) is how far the pinned showcase section has scrolled; the
 * camera pushes through the field and the accent glow intensifies with it.
 */
export default function WireScene({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    function boot(THREE: any) {
      if (disposed || !mount.current) return;
      const el = mount.current;
      const W = () => el.clientWidth;
      const H = () => el.clientHeight;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x05070a, 0.055);
      const camera = new THREE.PerspectiveCamera(52, W() / H(), 0.1, 200);
      camera.position.set(0, 0, 14);

      const accent = new THREE.Color(0x3b82f6);

      // ---- a jersey-ish outline (torso + two sleeves) as a line loop ----
      function jerseyGeometry() {
        const pts = [
          [-1.0, 1.4], [-0.55, 1.5], [-0.5, 1.1], [-1.5, 0.7], [-1.75, 0.15],
          [-1.2, -0.05], [-0.95, 0.35], [-0.95, -1.6], [0.95, -1.6], [0.95, 0.35],
          [1.2, -0.05], [1.75, 0.15], [1.5, 0.7], [0.5, 1.1], [0.55, 1.5], [1.0, 1.4],
          [0.45, 1.7], [-0.45, 1.7], [-1.0, 1.4],
        ].map(([x, y]) => new THREE.Vector3(x, y, 0));
        return new THREE.BufferGeometry().setFromPoints(pts);
      }
      const baseGeo = jerseyGeometry();

      // scatter a field of them
      const group = new THREE.Group();
      const items: any[] = [];
      const COUNT = 34;
      for (let i = 0; i < COUNT; i++) {
        const hue = 0.58 + Math.random() * 0.08;
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.55), transparent: true, opacity: 0.5 });
        const line = new THREE.LineLoop(baseGeo, mat);
        const s = 0.5 + Math.random() * 0.9;
        line.scale.setScalar(s);
        line.position.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 16, -Math.random() * 90);
        line.rotation.z = (Math.random() - 0.5) * 0.6;
        (line as any)._spin = (Math.random() - 0.5) * 0.004;
        (line as any)._drift = 0.004 + Math.random() * 0.01;
        group.add(line);
        items.push(line);
      }
      scene.add(group);

      // faint particle dust
      const dustGeo = new THREE.BufferGeometry();
      const N = 600, arr = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { arr[i * 3] = (Math.random() - 0.5) * 40; arr[i * 3 + 1] = (Math.random() - 0.5) * 24; arr[i * 3 + 2] = -Math.random() * 100; }
      dustGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x6b8cff, size: 0.05, transparent: true, opacity: 0.5 }));
      scene.add(dust);

      let raf = 0;
      const clock = new THREE.Clock();
      function loop() {
        if (disposed) return;
        const t = clock.getElapsedTime();
        const p = Math.max(0, Math.min(1, progressRef.current));

        // camera flies forward through the field with scroll
        camera.position.z = 14 - p * 70;
        camera.rotation.z = Math.sin(t * 0.1) * 0.02;

        items.forEach((l, i) => {
          l.rotation.z += l._spin;
          l.position.z += l._drift * (1 + p * 3);
          if (l.position.z > camera.position.z + 6) l.position.z -= 96; // recycle
          l.material.opacity = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.6 + i));
        });
        dust.rotation.y = t * 0.01;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }
      loop();

      const onResize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        baseGeo.dispose();
        el.removeChild(renderer.domElement);
      };
    }

    const w = window as any;
    if (w.THREE) boot(w.THREE);
    else {
      const onload = () => boot((window as any).THREE);
      const existing = document.getElementById("three-cdn");
      if (existing) existing.addEventListener("load", onload);
      else {
        const s = document.createElement("script");
        s.id = "three-cdn";
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
        s.onload = onload;
        document.head.appendChild(s);
      }
    }

    return () => { disposed = true; cleanup?.(); };
  }, [progressRef]);

  return <div ref={mount} style={{ position: "absolute", inset: 0 }} aria-hidden />;
}
