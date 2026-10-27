/**
 * Loads Three.js r128 (+ optional OrbitControls) from the CDN once per page.
 *
 * The rest of the app already pulls r128 as a UMD script (ScrollStory,
 * JerseyHero, Portfolio3D), so this keeps to the same build instead of adding
 * an npm dependency. Every caller shares one promise, and scripts that another
 * component already injected are reused rather than loaded twice.
 */

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const ORBIT_SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/controls/OrbitControls.js";
const GLTF_SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/GLTFLoader.js";
const MESHOPT_SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/libs/meshopt_decoder.js";

let pending: Promise<any> | null = null;
let pendingOrbit: Promise<any> | null = null;
let pendingGltf: Promise<any> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const found = Array.from(document.scripts).find(s => s.src === src) as (HTMLScriptElement & { _loaded?: boolean }) | undefined;
    if (found) {
      if (found._loaded) return resolve();
      found.addEventListener("load", () => resolve());
      found.addEventListener("error", () => reject(new Error("โหลด " + src + " ไม่สำเร็จ")));
      return;
    }
    const s = document.createElement("script") as HTMLScriptElement & { _loaded?: boolean };
    s.src = src;
    s.async = true;
    s.onload = () => { s._loaded = true; resolve(); };
    s.onerror = () => reject(new Error("โหลด " + src + " ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

/** resolves with window.THREE */
export function loadThree(): Promise<any> {
  const w = window as any;
  if (w.THREE) return Promise.resolve(w.THREE);
  if (!pending) pending = addScript(THREE_SRC).then(() => w.THREE);
  return pending;
}

/** resolves with window.THREE once THREE.OrbitControls is attached */
export function loadThreeWithOrbit(): Promise<any> {
  const w = window as any;
  if (w.THREE?.OrbitControls) return Promise.resolve(w.THREE);
  if (!pendingOrbit) pendingOrbit = loadThree().then(() => addScript(ORBIT_SRC)).then(() => w.THREE);
  return pendingOrbit;
}

/**
 * resolves with window.THREE once THREE.GLTFLoader is attached. Never rejects
 * because of the loader alone: without it, lib/jersey3d falls back to the
 * code-built jersey.
 */
export function loadThreeWithGltf(orbit = false): Promise<any> {
  const w = window as any;
  const base = orbit ? loadThreeWithOrbit() : loadThree();
  if (w.THREE?.GLTFLoader) return base;
  if (!pendingGltf) {
    pendingGltf = loadThree()
      .then(() => Promise.all([addScript(GLTF_SRC), addScript(MESHOPT_SRC).catch(() => undefined)]))
      .then(() => {
        // the models are meshopt-compressed: every GLTFLoader gets the decoder
        const Base = w.THREE.GLTFLoader;
        if (Base && w.MeshoptDecoder && !Base.__axMeshopt) {
          class Loader extends Base {
            constructor(manager?: any) {
              super(manager);
              this.setMeshoptDecoder(w.MeshoptDecoder);
            }
          }
          (Loader as any).__axMeshopt = true;
          w.THREE.GLTFLoader = Loader;
        }
      })
      .catch(() => undefined)
      .then(() => w.THREE);
  }
  return Promise.all([base, pendingGltf]).then(() => w.THREE);
}

/** true when the browser can create a WebGL context at all */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

/** respects the OS "reduce motion" setting */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const POST_BASE = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/";
const POST_SRCS = [
  "shaders/CopyShader.js",
  "shaders/LuminosityHighPassShader.js",
  "shaders/GammaCorrectionShader.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/RenderPass.js",
  "postprocessing/ShaderPass.js",
  "postprocessing/UnrealBloomPass.js",
];
let pendingPost: Promise<boolean> | null = null;

/**
 * Bloom post-processing (EffectComposer + UnrealBloomPass) for the landing
 * scene. Resolves true when every script loaded; false means "render without
 * bloom" — never rejects. Call after THREE itself is loaded.
 */
export function loadThreePost(): Promise<boolean> {
  const w = window as any;
  if (w.THREE?.UnrealBloomPass && w.THREE?.EffectComposer) return Promise.resolve(true);
  if (!pendingPost) {
    pendingPost = POST_SRCS.reduce<Promise<void>>((p, src) => p.then(() => addScript(POST_BASE + src)), Promise.resolve())
      .then(() => !!(w.THREE?.UnrealBloomPass && w.THREE?.EffectComposer))
      .catch(() => false);
  }
  return pendingPost;
}
