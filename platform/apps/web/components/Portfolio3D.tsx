"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

const COLORS: { label: string; hex: string }[] = [
  { label: "ชมพู", hex: "#d7a6c1" },
  { label: "YUTA ส้ม", hex: "#e8602f" },
  { label: "YUTA ฟ้า", hex: "#31a6de" },
  { label: "SEIJO เหลือง", hex: "#f2ce00" },
  { label: "MEIWA แดง", hex: "#e2453a" },
  { label: "เขียว", hex: "#2f9e44" },
  { label: "น้ำเงิน", hex: "#2563eb" },
  { label: "ม่วง", hex: "#7c3aed" },
  { label: "ดำ", hex: "#1b1d22" },
  { label: "ขาว", hex: "#eef1f5" },
];

export default function Portfolio3D({ theme }: { theme: Theme }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const setColorRef = useRef<((hex: string) => void) | null>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    const accent = theme === "light" ? 0x2563eb : 0x4dbfb0;

    function boot(THREE: any) {
      const mount = mountRef.current;
      if (disposed || !mount) return;
      const W = () => mount.clientWidth || 480;
      const H = () => mount.clientHeight || 380;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      renderer.outputEncoding = THREE.sRGBEncoding;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100);
      camera.position.set(0, -0.1, 9.2);

      scene.add(new THREE.AmbientLight(0xffffff, 0.82));
      const kL = new THREE.DirectionalLight(0xffffff, 1.15); kL.position.set(3, 7, 6); scene.add(kL);
      const fL = new THREE.DirectionalLight(0xdfe8ff, 0.45); fL.position.set(-4, 2, 4); scene.add(fL);
      const rL = new THREE.PointLight(accent, 1.7, 40); rL.position.set(-5, 3, -3); scene.add(rL);

      const skin = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 0.12, roughness: 0.5 });   // matte-grey mannequin
      const shirt = new THREE.MeshStandardMaterial({ color: 0xd7a6c1, metalness: 0.03, roughness: 0.62 });  // the ONLY changeable part

      const limb = (len: number, rt: number, rb: number, m: any) => { const g = new THREE.CylinderGeometry(rt, rb, len, 16); g.translate(0, -len / 2, 0); return new THREE.Mesh(g, m); };
      const ball = (r: number, m: any) => new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m);
      const leg = (sx: number) => {
        const hip = new THREE.Group(); hip.position.set(sx, 0, 0);
        hip.add(ball(0.22, skin)); hip.add(limb(0.98, 0.22, 0.15, skin));
        const kn = new THREE.Group(); kn.position.y = -0.98; hip.add(kn);
        kn.add(ball(0.16, skin)); kn.add(limb(0.94, 0.14, 0.1, skin));
        const ft = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.14, 0.52), skin); ft.position.set(0, -0.92, 0.14); kn.add(ft);
        return { hip, kn };
      };
      const arm = (sx: number) => {
        const sh = new THREE.Group(); sh.position.set(sx, 1.42, 0);
        sh.add(ball(0.18, skin)); sh.add(limb(0.74, 0.13, 0.1, skin));
        const el = new THREE.Group(); el.position.y = -0.74; sh.add(el);
        el.add(ball(0.11, skin)); el.add(limb(0.72, 0.1, 0.075, skin)); el.add(ball(0.1, skin).translateY(-0.72));
        return { sh, el };
      };

      const figure = new THREE.Group();
      const legL = leg(-0.26), legR = leg(0.26), armL = arm(-0.62), armR = arm(0.62);
      figure.add(legL.hip, legR.hip, armL.sh, armR.sh);

      // grey body
      const hips = ball(0.44, skin); hips.scale.set(1, 0.72, 0.82); hips.position.y = 0.02; figure.add(hips);
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.4, 24), skin); torso.position.y = 0.85; figure.add(torso);
      const chest = ball(0.5, skin); chest.scale.set(1, 0.62, 0.72); chest.position.set(0, 1.12, 0.05); figure.add(chest);
      figure.add(ball(0.16, skin).translateY(1.55));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.22, 14), skin); neck.position.y = 1.68; figure.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 26, 22), skin); head.position.y = 2.03; head.scale.set(0.92, 1.16, 1); figure.add(head);

      // shirt (long, short-sleeved) — recolours
      const shirtBody = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.54, 1.55, 28), shirt); shirtBody.position.y = 0.52; figure.add(shirtBody);
      const shirtTop = ball(0.56, shirt); shirtTop.scale.set(1, 0.52, 0.8); shirtTop.position.set(0, 1.3, 0.02); figure.add(shirtTop);
      [-0.62, 0.62].forEach((sx) => { const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.55, 18), shirt); sl.position.set(sx, 1.24, 0); figure.add(sl); });
      // collar hint
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 10, 22), shirt); collar.rotation.x = Math.PI / 2; collar.position.y = 1.58; figure.add(collar);

      // resting stance (no walking — display mannequin)
      legL.hip.rotation.z = 0.05; legR.hip.rotation.z = -0.05;
      legL.kn.rotation.x = 0.03; legR.kn.rotation.x = 0.03;
      armL.sh.rotation.set(0.06, 0, 0.13); armR.sh.rotation.set(0.06, 0, -0.13);
      armL.el.rotation.x = 0.12; armR.el.rotation.x = 0.12;

      figure.position.y = -0.5; scene.add(figure);

      // round base (like a display stand)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.09, 44), new THREE.MeshStandardMaterial({ color: 0x30333a, metalness: 0.55, roughness: 0.38 }));
      base.position.y = -2.46; scene.add(base);
      // soft shadow on the base
      const shTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!; const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62); rg.addColorStop(0, "rgba(0,0,0,0.33)"); rg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -2.4; scene.add(shadow);

      const start = performance.now();
      let spinT = -1, userY = 0.35, curY = 0.35, dragging = false, lastX = 0;
      function setColor(hex: string) { shirt.color.setStyle(hex); shirt.needsUpdate = true; spinT = performance.now(); }
      setColor(COLORS[activeRef.current].hex);
      setColorRef.current = setColor;

      const el = renderer.domElement;
      const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; el.setPointerCapture(e.pointerId); };
      const move = (e: PointerEvent) => { if (!dragging) return; userY += (e.clientX - lastX) * 0.009; lastX = e.clientX; };
      const up = () => { dragging = false; };
      el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); window.addEventListener("pointerup", up);

      let raf = 0;
      function animate() {
        raf = requestAnimationFrame(animate);
        const now = performance.now(), t = (now - start) / 1000;
        const inn = Math.min(1, t / 0.7);
        figure.scale.setScalar(0.95 + 0.05 * inn);
        figure.position.y = -0.5 + Math.sin(now * 0.0009) * 0.015;
        const spinning = spinT > 0 && now - spinT < 600;
        if (!dragging && !spinning) userY += 0.0035;   // slow turntable
        if (spinning) userY += 0.33;
        curY += (userY - curY) * 0.08; figure.rotation.y = curY;
        camera.lookAt(0, -0.35, 0);
        renderer.render(scene, camera);
      }
      animate();

      function onResize() { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); }
      const ro = new ResizeObserver(onResize); ro.observe(mount);

      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        renderer.dispose(); if (el.parentNode) el.parentNode.removeChild(el); setColorRef.current = null;
      };
    }

    const w = window as any;
    if (w.THREE) boot(w.THREE);
    else {
      const ex = document.getElementById("three-r128") as HTMLScriptElement | null;
      const ol = () => boot((window as any).THREE);
      if (ex) ex.addEventListener("load", ol);
      else { const s = document.createElement("script"); s.id = "three-r128"; s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"; s.onload = ol; document.head.appendChild(s); }
    }
    return () => { disposed = true; if (cleanup) cleanup(); };
  }, [theme]);

  return (
    <div className="show3d">
      <div className="stage3d" ref={mountRef}>
        <span className="hint3d">ลากเพื่อหมุน · drag to rotate</span>
      </div>
      <div className="patrow">
        {COLORS.map((c, i) => (
          <button
            key={i}
            className={"patbtn" + (i === active ? " on" : "")}
            title={c.label}
            onClick={() => { activeRef.current = i; setActive(i); setColorRef.current?.(c.hex); }}
          >
            <span className="swatch" style={{ background: c.hex }} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
