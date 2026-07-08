"use client";

import { useEffect, useRef } from "react";

type Theme = "light" | "dark";

/**
 * Scroll-driven 3D jersey background (Three.js r128 from CDN).
 * Accent colour, chest logo and fog switch with the active theme.
 */
export default function LandingScene({ theme }: { theme: Theme }) {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const accent = theme === "light" ? 0x2563eb : 0x4dbfb0;
    const fogColor = theme === "light" ? 0xe6eefb : 0x0a0e0d;
    const logoSrc = theme === "light" ? "/logo-mark-blue.png" : "/logo-mark.png";

    function boot(THREE: any) {
      if (disposed || !sceneRef.current) return;
      const sceneEl = sceneRef.current;
      const W = () => window.innerWidth;
      const H = () => window.innerHeight;
      let isMobile = window.innerWidth < 760;

      const STEPS = [
        { ry: 0.0, rx: -0.05, px: 0.0, py: 0.0, s: 1.0 },
        { ry: -0.55, rx: 0.05, px: 2.3, py: 0.1, s: 0.95 },
        { ry: 0.55, rx: 0.05, px: -2.3, py: 0.1, s: 0.95 },
        { ry: -0.4, rx: -0.1, px: 2.2, py: 0.0, s: 0.95 },
        { ry: 0.45, rx: 0.08, px: -2.2, py: 0.0, s: 0.95 },
        { ry: -0.5, rx: 0.05, px: 2.2, py: 0.0, s: 0.95 },
        { ry: 0.0, rx: -0.05, px: 0.0, py: 0.0, s: 1.08 },
      ];

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      sceneEl.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(fogColor, 0.07);
      const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 9.2);

      scene.add(new THREE.AmbientLight(0x9fb4b0, theme === "light" ? 0.8 : 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.25);
      key.position.set(4, 6, 8);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfd4d0, 0.5);
      fill.position.set(-5, 1, 6);
      scene.add(fill);
      const rim = new THREE.PointLight(accent, 1.8, 40);
      rim.position.set(-6, 2, 4);
      scene.add(rim);
      const rim2 = new THREE.PointLight(accent, 1.1, 40);
      rim2.position.set(6, -3, 3);
      scene.add(rim2);

      function tankShape() {
        const s = new THREE.Shape();
        s.moveTo(-0.55, 1.78);
        s.quadraticCurveTo(0, 1.02, 0.55, 1.78);
        s.lineTo(0.92, 1.82);
        s.bezierCurveTo(0.74, 1.25, 0.92, 0.55, 1.12, 0.18);
        s.lineTo(1.3, -2.05);
        s.quadraticCurveTo(0, -2.38, -1.3, -2.05);
        s.lineTo(-1.12, 0.18);
        s.bezierCurveTo(-0.92, 0.55, -0.74, 1.25, -0.92, 1.82);
        s.lineTo(-0.55, 1.78);
        return s;
      }
      const geo = new THREE.ExtrudeGeometry(tankShape(), {
        depth: 0.42, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 6, steps: 1,
      });
      geo.center();
      const posAttr = geo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        posAttr.setZ(i, z + 0.5 * Math.cos(Math.min(Math.abs(x) / 1.45, 1) * (Math.PI / 2)) - 0.18);
      }
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      const zf = geo.boundingBox.max.z + 0.05;

      function meshTexture() {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const x = c.getContext("2d")!;
        x.fillStyle = "#bcc1c1";
        x.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 16; r++)
          for (let col = 0; col < 16; col++) {
            const ox = (r % 2) * 8;
            x.fillStyle = "#a3a9a9";
            x.beginPath();
            x.arc(col * 16 + ox + 4, r * 16 + 8, 2.6, 0, 7);
            x.fill();
            x.fillStyle = "#8e9494";
            x.beginPath();
            x.arc(col * 16 + ox + 4, r * 16 + 8, 1.3, 0, 7);
            x.fill();
          }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(7, 9);
        return t;
      }
      const fabric = meshTexture();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xb0b5b5, metalness: 0.06, roughness: 0.92, map: fabric, bumpMap: fabric,
        bumpScale: 0.045, emissive: 0x0c1413, emissiveIntensity: 0.08,
      });
      const jersey = new THREE.Group();
      jersey.add(new THREE.Mesh(geo, mat));
      const edges = new THREE.EdgesGeometry(geo, 30);
      jersey.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5 })));
      const outline = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: accent, side: THREE.BackSide }));
      outline.scale.set(1.045, 1.04, 1.0);
      jersey.add(outline);

      const logoTex = new THREE.TextureLoader().load(logoSrc);
      logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.66), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }));
      decal.position.set(0, 0.34, zf + 0.02);
      jersey.add(decal);
      scene.add(jersey);

      const pGeo = new THREE.BufferGeometry();
      const N = 110;
      const arr = new Float32Array(N * 3);
      for (let i = 0; i < N * 3; i++) arr[i] = (Math.random() - 0.5) * 22;
      pGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: accent, size: 0.05, transparent: true, opacity: theme === "light" ? 0.5 : 0.4 }));
      scene.add(particles);

      const cur = { ry: 0, rx: -0.05, px: 0, py: 0, s: 1 };
      function scrollTargets() {
        const vh = window.innerHeight;
        const idx = window.scrollY / vh;
        const i0 = Math.max(0, Math.min(STEPS.length - 1, Math.floor(idx)));
        const i1 = Math.min(STEPS.length - 1, i0 + 1);
        const f = Math.max(0, Math.min(1, idx - i0));
        const a = STEPS[i0];
        const b = STEPS[i1];
        const L = (k: keyof typeof a) => a[k] + (b[k] - a[k]) * f;
        return { ry: L("ry"), rx: L("rx"), px: isMobile ? 0 : L("px"), py: L("py"), s: L("s") };
      }

      let raf = 0;
      function animate() {
        raf = requestAnimationFrame(animate);
        const t = scrollTargets();
        cur.ry += (t.ry - cur.ry) * 0.08;
        cur.rx += (t.rx - cur.rx) * 0.08;
        cur.px += (t.px - cur.px) * 0.08;
        cur.py += (t.py - cur.py) * 0.08;
        cur.s += (t.s - cur.s) * 0.08;
        jersey.rotation.y = cur.ry;
        jersey.rotation.x = cur.rx;
        jersey.position.x = cur.px;
        jersey.position.y = cur.py + Math.sin(Date.now() * 0.0007) * 0.08;
        jersey.scale.setScalar(cur.s);
        particles.rotation.y += 0.0004;
        renderer.render(scene, camera);
      }
      animate();

      function onResize() {
        isMobile = window.innerWidth < 760;
        camera.aspect = W() / H();
        camera.updateProjectionMatrix();
        renderer.setSize(W(), H());
      }
      window.addEventListener("resize", onResize);

      const secs = Array.from(document.querySelectorAll<HTMLElement>(".landing .sec"));
      const dotsWrap = document.getElementById("dots");
      const dots: HTMLElement[] = [];
      if (dotsWrap) {
        dotsWrap.innerHTML = "";
        secs.forEach((_, i) => {
          const a = document.createElement("a");
          a.href = "#";
          a.onclick = (e) => {
            e.preventDefault();
            window.scrollTo({ top: i * window.innerHeight, behavior: "smooth" });
          };
          dotsWrap.appendChild(a);
          dots.push(a);
        });
      }
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              const i = secs.indexOf(e.target as HTMLElement);
              dots.forEach((d, k) => d.classList.toggle("on", k === i));
            }
          }),
        { threshold: 0.4 },
      );
      secs.forEach((s) => io.observe(s));

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        io.disconnect();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    }

    const w = window as any;
    if (w.THREE) {
      boot(w.THREE);
    } else {
      const existing = document.getElementById("three-r128") as HTMLScriptElement | null;
      const onload = () => boot((window as any).THREE);
      if (existing) {
        existing.addEventListener("load", onload);
      } else {
        const s = document.createElement("script");
        s.id = "three-r128";
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
        s.onload = onload;
        document.head.appendChild(s);
      }
    }

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [theme]);

  return <div id="scene" ref={sceneRef} />;
}
