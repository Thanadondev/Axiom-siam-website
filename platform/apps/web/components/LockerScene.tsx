"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadThreeWithGltf, hasWebGL, prefersReducedMotion } from "../lib/three-cdn";
import { loadJersey, type JerseyLook } from "../lib/jersey3d";
import { loadFactoryKit, makeDressForm, formBaseOf, formKindOf, FORM_KIT_SCALE } from "../lib/factory-kit";
import type { Kit } from "../lib/kits";

export type LockerView = "front" | "side" | "back";

export interface LockerHandle {
  /** renders one frame at the given size and returns it as a PNG data URL */
  capture(width: number, height: number): string | null;
}

const VIEW_ANGLE: Record<LockerView, number> = { front: 0, side: -Math.PI / 2, back: Math.PI };

function canvasTex(THREE: any, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/**
 * The customizer's locker room. Views turn the shirt on its hanger rather
 * than moving the camera behind it, so the room stays in frame from every side;
 * drag still orbits within a range that never leaves the room.
 */
/** on the display form the shirt is shown a little smaller so the stand fits to the floor */
const FORM_SHIRT = 0.75;

const LockerScene = forwardRef<LockerHandle, { kit: Kit; look: JerseyLook; view: LockerView; mannequin?: boolean; onFail: () => void }>(
  function LockerScene({ kit, look, view, mannequin = false, onFail }, ref) {
    const mount = useRef<HTMLDivElement>(null);
    const lookRef = useRef(look);
    const viewRef = useRef(view);
    const failRef = useRef(onFail);
    const api = useRef<{ setLook(l: JerseyLook): void; capture: LockerHandle["capture"]; resetOrbit(): void } | null>(null);
    lookRef.current = look;
    failRef.current = onFail;

    useImperativeHandle(ref, () => ({ capture: (w, h) => api.current?.capture(w, h) ?? null }), []);
    useEffect(() => { api.current?.setLook(look); }, [look]);
    useEffect(() => { viewRef.current = view; api.current?.resetOrbit(); }, [view]);

    useEffect(() => {
      if (!hasWebGL()) { failRef.current(); return; }
      let disposed = false;
      let cleanup: (() => void) | null = null;

      loadThreeWithGltf(true).then(async (THREE: any) => {
        // on the display form (a headless kit-shop torso on a stand), or on the hanger
        const prims = mannequin ? await loadFactoryKit(THREE) : null;
        const onForm = !!prims?.dress_form?.length;
        const jersey = await loadJersey(THREE, kit, onForm ? {} : { hanger: true });
        const subject = jersey;
        if (disposed || !mount.current) { subject.dispose(); return; }
        const el = mount.current;
        const trash: any[] = [];
        const keep = <T,>(o: T) => { trash.push(o); return o; };

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111214);
        scene.fog = new THREE.Fog(0x111214, 13, 30);
        const camera = new THREE.PerspectiveCamera(34, el.clientWidth / el.clientHeight, 0.1, 80);
        // shorts sit lower and are shorter than a shirt: frame them closer
        const shorts = jersey.layout === "shorts";
        const HOME = shorts
          ? (onForm ? new THREE.Vector3(0, 0.25, 9.6) : new THREE.Vector3(0, 1.1, 9.6))
          : onForm ? new THREE.Vector3(0, 1.25, 11.4) : new THREE.Vector3(0, 0.55, 11.4);
        const TARGET = shorts
          ? (onForm ? new THREE.Vector3(0, -0.45, 0) : new THREE.Vector3(0, 0.45, 0))
          : onForm ? new THREE.Vector3(0, 0.45, 0) : new THREE.Vector3(0, -0.25, 0);
        camera.position.copy(HOME);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.copy(TARGET);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 5.2;
        controls.maxDistance = 14;
        controls.minPolarAngle = Math.PI * 0.32;
        controls.maxPolarAngle = Math.PI * 0.56;
        controls.minAzimuthAngle = -0.75;
        controls.maxAzimuthAngle = 0.75;
        controls.update();

        // ---------- room ----------
        const FLOOR = -2.75;
        const concrete = canvasTex(THREE, 512, 512, x => {
          x.fillStyle = "#2a2c2e"; x.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 9000; i++) {
            const v = 30 + Math.random() * 26;
            x.fillStyle = `rgba(${v},${v + 1},${v + 3},${0.25 + Math.random() * 0.4})`;
            x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
          }
        });
        concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
        concrete.repeat.set(8, 8);
        keep(concrete);
        const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), keep(new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.92 })));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = FLOOR;
        floor.receiveShadow = true;
        scene.add(floor);

        // painted bay lines + the locker number on the floor (tracks the shirt number)
        const floorCanvas = document.createElement("canvas");
        floorCanvas.width = 1024; floorCanvas.height = 512;
        const floorTex = keep(new THREE.CanvasTexture(floorCanvas));
        floorTex.encoding = THREE.sRGBEncoding;
        const drawFloor = (num: string) => {
          const x = floorCanvas.getContext("2d")!;
          x.clearRect(0, 0, 1024, 512);
          x.strokeStyle = "rgba(225,224,218,.55)";
          x.lineWidth = 10;
          x.beginPath(); x.moveTo(60, 40); x.lineTo(60, 480); x.moveTo(964, 40); x.lineTo(964, 480); x.stroke();
          x.fillStyle = "rgba(225,224,218,.42)";
          x.font = '400 120px "Anton", sans-serif';
          x.textAlign = "center"; x.textBaseline = "middle";
          x.fillText(`LOCKER ${num || "--"}`, 512, 360);
          floorTex.needsUpdate = true;
        };
        const floorMark = new THREE.Mesh(keep(new THREE.PlaneGeometry(9, 4.5)), keep(new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.9, depthWrite: false })));
        floorMark.rotation.x = -Math.PI / 2;
        floorMark.position.set(0, FLOOR + 0.01, 1.6);
        floorMark.receiveShadow = true;
        scene.add(floorMark);

        const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 16)), keep(new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.95 })));
        wall.position.set(0, FLOOR + 8, -5.4);
        wall.receiveShadow = true;
        scene.add(wall);

        // lockers
        const lockerMat = keep(new THREE.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.45, roughness: 0.55 }));
        const ventTex = keep(canvasTex(THREE, 128, 512, x => {
          x.fillStyle = "#1f2226"; x.fillRect(0, 0, 128, 512);
          x.fillStyle = "#121315";
          for (let i = 0; i < 7; i++) x.fillRect(28, 40 + i * 14, 72, 6);
          x.fillStyle = "#2c3035"; x.fillRect(0, 0, 3, 512); x.fillRect(125, 0, 3, 512);
          x.fillStyle = "#3a3e44"; x.fillRect(96, 230, 8, 60);
        }));
        const doorMat = keep(new THREE.MeshStandardMaterial({ map: ventTex, metalness: 0.4, roughness: 0.6 }));
        const lockerGeo = keep(new THREE.BoxGeometry(1.5, 4.6, 0.9));
        const lockerMats = [lockerMat, lockerMat, lockerMat, lockerMat, doorMat, lockerMat];
        for (let i = -6; i <= 6; i++) {
          if (Math.abs(i) <= 1) continue; // gap behind the shirt
          const l = new THREE.Mesh(lockerGeo, lockerMats);
          l.position.set(i * 1.56, FLOOR + 2.3, -4.9);
          l.castShadow = true; l.receiveShadow = true;
          scene.add(l);
          const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.42, 0.24)), keep(new THREE.MeshBasicMaterial({
            map: keep(canvasTex(THREE, 128, 72, x => {
              x.fillStyle = "#2b2e33"; x.fillRect(0, 0, 128, 72);
              x.fillStyle = "#8b8f96"; x.font = '600 34px ui-monospace, Menlo, monospace'; x.textAlign = "center"; x.textBaseline = "middle";
              x.fillText(String(i + 7).padStart(2, "0"), 64, 38);
            })),
          })));
          plate.position.set(i * 1.56 - 0.35, FLOOR + 4.1, -4.44);
          scene.add(plate);
        }
        // bench
        const benchMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.7 }));
        for (const bx of [-5.5, 5.5]) {
          const bench = new THREE.Mesh(keep(new THREE.BoxGeometry(4.2, 0.16, 0.9)), benchMat);
          bench.position.set(bx, FLOOR + 0.9, -3.4);
          bench.castShadow = true; bench.receiveShadow = true;
          scene.add(bench);
        }
        // orange strip lights on the wall, white bars overhead
        const glowOrange = keep(new THREE.MeshBasicMaterial({ color: 0xff6a2b }));
        const glowWhite = keep(new THREE.MeshBasicMaterial({ color: 0xf1efe8 }));
        for (const sx of [-1, 1]) {
          const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(8, 0.05, 0.05)), glowOrange);
          strip.position.set(sx * 7.4, FLOOR + 5.15, -4.42);
          scene.add(strip);
          const pl = new THREE.PointLight(0xff6a2b, 1.1, 9, 2);
          pl.position.set(sx * 5.5, FLOOR + 5.0, -3.6);
          scene.add(pl);
          const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(3.2, 0.06, 0.18)), glowWhite);
          bar.position.set(sx * 3.4, FLOOR + 8.2, -1.5);
          scene.add(bar);
        }
        const wordTex = keep(canvasTex(THREE, 128, 512, x => {
          x.fillStyle = "rgba(120,123,128,.5)"; x.font = '600 52px "Noto Sans Thai", sans-serif';
          x.textAlign = "center";
          ["ที", "ม", "เดี", "ยว", "กั", "น"].forEach((ch, i) => x.fillText(ch, 64, 70 + i * 74));
        }));
        const word = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.5, 2)), keep(new THREE.MeshBasicMaterial({ map: wordTex, transparent: true })));
        word.position.set(10.9, FLOOR + 3.6, -4.43);
        scene.add(word);

        // ---------- lights on the shirt ----------
        scene.add(new THREE.HemisphereLight(0xf2efe8, 0x1a1512, 0.55));
        const spot = new THREE.SpotLight(0xffffff, 1.9, 30, 0.55, 0.6, 1.2);
        spot.position.set(2.5, 7.5, 7);
        spot.target.position.set(0, 0, 0);
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0008;
        scene.add(spot, spot.target);
        const fill = new THREE.DirectionalLight(0xbfcde6, 0.5); fill.position.set(-5, 2, 5); scene.add(fill);
        const rimL = new THREE.DirectionalLight(0xff8a4c, 0.7); rimL.position.set(-4, 3, -4); scene.add(rimL);

        // ---------- shirt on a hook ----------
        const pivot = new THREE.Group();
        scene.add(pivot);
        subject.group.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
        if (onForm) {
          // the form stands on the floor; the shirt sits on it at the size the form was built for
          const k = FORM_SHIRT / FORM_KIT_SCALE;
          const form = makeDressForm(THREE, prims, formKindOf(jersey));
          form.scale.setScalar(k);
          form.position.y = FLOOR;
          pivot.add(form);
          jersey.group.scale.setScalar(FORM_SHIRT);
          jersey.group.position.y = FLOOR - formBaseOf(jersey) * FORM_SHIRT;
          pivot.add(jersey.group);
        } else {
          pivot.add(jersey.group);
          const railMat = keep(new THREE.MeshStandardMaterial({ color: 0x8e939a, metalness: 0.9, roughness: 0.28 }));
          if (typeof jersey.hookTop === "number") {
            // a hanging rail across the locker bay, through the hook
            const rail = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.045, 9, 20)), railMat);
            rail.rotation.z = Math.PI / 2;
            rail.position.set(0, jersey.hookTop, jersey.hookZ ?? 0);
            scene.add(rail);
            for (const sx of [-4.4, 4.4]) {
              const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 6, 12)), railMat);
              post.position.set(sx, jersey.hookTop + 3, jersey.hookZ ?? 0);
              scene.add(post);
            }
          } else {
            const hookY = jersey.top + 0.62 + 0.18;
            const hookBar = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 10)), railMat);
            hookBar.position.set(0, hookY + 1.8, 0);
            scene.add(hookBar);
          }
        }

        const setLook = (l: JerseyLook) => { subject.setLook(l); drawFloor(l.number); };
        setLook(lookRef.current);

        const still = prefersReducedMotion();
        let orbitTo: any = null;
        const resetOrbit = () => { orbitTo = HOME.clone(); };

        const capture = (w: number, h: number) => {
          const size = new THREE.Vector2();
          renderer.getSize(size);
          const pr = renderer.getPixelRatio();
          renderer.setPixelRatio(1);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          const url = renderer.domElement.toDataURL("image/png");
          renderer.setPixelRatio(pr);
          renderer.setSize(size.x, size.y, false);
          camera.aspect = size.x / size.y;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          return url;
        };
        api.current = { setLook, capture, resetOrbit };

        const onLost = (e: Event) => { e.preventDefault(); failRef.current(); };
        renderer.domElement.addEventListener("webglcontextlost", onLost);
        controls.addEventListener("start", () => { orbitTo = null; });

        const fit = () => {
          const w = el.clientWidth, h = el.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);

        let raf = 0;
        let last = performance.now();
        const loop = (now: number) => {
          raf = requestAnimationFrame(loop);
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          if (document.hidden) return;
          const goal = VIEW_ANGLE[viewRef.current];
          // time-based easing: the same ~0.5 s turn at 30 fps or 144 fps
          const k = still ? 1 : 1 - Math.exp(-dt * 6);
          pivot.rotation.y += (goal - pivot.rotation.y) * k;
          if (orbitTo) {
            camera.position.lerp(orbitTo, k);
            if (camera.position.distanceTo(orbitTo) < 0.01) orbitTo = null;
          }
          controls.update();
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(loop);

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          renderer.domElement.removeEventListener("webglcontextlost", onLost);
          controls.dispose();
          api.current = null;
          subject.dispose();
          for (const t of trash) t.dispose?.();
          renderer.dispose();
          renderer.domElement.remove();
        };
      }).catch(() => failRef.current());

      return () => { disposed = true; cleanup?.(); };
    }, [kit, mannequin]);

    return <div ref={mount} style={{ position: "absolute", inset: 0 }} role="img" aria-label={`ห้องล็อกเกอร์: ${kit.name} ลากเพื่อหมุนมุมกล้อง`} />;
  },
);

export default LockerScene;
