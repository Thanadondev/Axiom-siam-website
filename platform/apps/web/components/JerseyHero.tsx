"use client";

import { useEffect, useRef } from "react";

/**
 * The hero jersey — a real 3D model (jersey.glb, built in Blender) that turns
 * slowly and tilts a little with the pointer. Three.js r128 + GLTFLoader from
 * CDN, same loader pattern used elsewhere in the app.
 */
export default function JerseyHero() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    function boot(THREE: any) {
      if (disposed || !mount.current || !THREE.GLTFLoader) return;
      const el = mount.current;
      const W = () => el.clientWidth;
      const H = () => el.clientHeight;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      renderer.outputEncoding = THREE.sRGBEncoding;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 6.4);

      // studio lighting tuned for a black garment: white key + fill, blue edge rims
      scene.add(new THREE.AmbientLight(0x9fb2ff, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(3, 4, 5); scene.add(key);
      const fill = new THREE.DirectionalLight(0xbcd0ff, 1.1); fill.position.set(-3, 1, 4); scene.add(fill);
      const rimL = new THREE.PointLight(0x3b82f6, 6, 30); rimL.position.set(-4, 1, -3); scene.add(rimL);
      const rimR = new THREE.PointLight(0x60a5fa, 5, 30); rimR.position.set(4, 0, -3); scene.add(rimR);

      const pivot = new THREE.Group();
      scene.add(pivot);

      let target = { x: 0, y: 0 };
      new THREE.GLTFLoader().load(
        "/models/tank.glb",
        (gltf: any) => {
          if (disposed) return;
          const m = gltf.scene;
          // fit to a consistent size regardless of export scale
          const box = new THREE.Box3().setFromObject(m);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const s = 3.6 / Math.max(size.x, size.y, size.z);
          m.scale.setScalar(s);
          m.position.sub(center.multiplyScalar(s));
          pivot.add(m);
        },
        undefined,
        () => { /* model missing — hero just stays dark, no crash */ },
      );

      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
        target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.4;
      };
      window.addEventListener("pointermove", onMove);

      let raf = 0;
      const clock = new THREE.Clock();
      function loop() {
        if (disposed) return;
        const t = clock.getElapsedTime();
        pivot.rotation.y = t * 0.35 + target.x;   // slow auto-spin + pointer nudge
        pivot.rotation.x += (target.y - pivot.rotation.x) * 0.05;
        pivot.position.y = Math.sin(t * 0.9) * 0.08;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }
      loop();

      const onResize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onMove);
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
    }

    // load three then the GLTFLoader (r128 build that attaches THREE.GLTFLoader)
    function ensureThree(cb: () => void) {
      const w = window as any;
      if (w.THREE && w.THREE.GLTFLoader) return cb();
      const addScript = (id: string, src: string, next: () => void) => {
        const ex = document.getElementById(id);
        if (ex) { ex.addEventListener("load", next); if ((ex as any)._loaded) next(); return; }
        const s = document.createElement("script");
        s.id = id; s.src = src;
        s.onload = () => { (s as any)._loaded = true; next(); };
        document.head.appendChild(s);
      };
      addScript("three-cdn", "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", () =>
        addScript("three-gltf", "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/GLTFLoader.js", cb),
      );
    }
    ensureThree(() => boot((window as any).THREE));

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return <div ref={mount} style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%,-50%)", width: "min(88vw, 720px)", height: "min(70vh, 620px)" }} aria-hidden />;
}
