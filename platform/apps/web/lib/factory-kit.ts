/**
 * The modelled factory props (public/models/factory/factory_kit.glb, built by
 * platform/scripts/blender/factory_kit.py). Each prop is a root object in the
 * file, standing at the origin and facing +z.
 */

export type KitPrim = { geo: any; mat: any; local: any };
export type KitPrims = Record<string, KitPrim[]>;

const URL = "/models/factory/factory_kit.glb";
let pending: Promise<KitPrims | null> | null = null;

/** loads the props once per page; resolves null if the file can't be loaded */
export function loadFactoryKit(THREE: any): Promise<KitPrims | null> {
  if (!pending) {
    pending = new Promise(resolve => {
      new THREE.GLTFLoader().load(URL, (gltf: any) => {
        gltf.scene.updateMatrixWorld(true);
        const prims: KitPrims = {};
        gltf.scene.children.forEach((root: any) => {
          const list: KitPrim[] = [];
          root.traverse((o: any) => {
            if (!o.isMesh) return;
            const m = o.material;
            if (m.name === "Glow") { m.emissiveIntensity = 2.2; m.toneMapped = false; }
            if (m.name === "Screen") m.emissiveIntensity = 1.4;
            if (m.name === "Fabric") m.color.setHex(0xffffff);
            list.push({ geo: o.geometry, mat: m, local: o.matrixWorld.clone() });
          });
          prims[root.name] = list;
        });
        resolve(prims);
      }, undefined, () => { pending = null; resolve(null); });
    });
  }
  return pending;
}

/**
 * The headless display form on its chrome stand, as a plain group (meshes share
 * the loaded geometry, so nothing to dispose per copy). Built for a kit at scale
 * 0.26 whose origin sits 1.25 m above the floor: scale the form by kitScale / 0.26.
 */
export const FORM_KIT_SCALE = 0.26;
export const FORM_KIT_Y = 1.25;
/** the form's floor in a jersey's own units: from the draped model if it says, else the default fit */
export function formBaseOf(j: { formBase?: number }) {
  return typeof j.formBase === "number" ? j.formBase : -FORM_KIT_Y / FORM_KIT_SCALE;
}

/**
 * which form: with arms (short sleeves), without (singlets, and long sleeves — those are
 * draped hanging at the sides, where the form's held-out arms would poke through), or the
 * lower-body form (shorts)
 */
export type FormKind = "arms" | "sleeveless" | "hip";

export function formKindOf(j: { sleeved?: boolean; longSleeves?: boolean; layout?: string }): FormKind {
  return j.layout === "shorts" ? "hip" : j.sleeved === false || j.longSleeves ? "sleeveless" : "arms";
}

export function makeDressForm(THREE: any, prims: KitPrims | null, kind: FormKind | boolean = true) {
  const g = new THREE.Group();
  const k: FormKind = kind === true ? "arms" : kind === false ? "sleeveless" : kind;
  const parts =
    (k === "hip" ? prims?.hip_form : k === "sleeveless" && prims?.dress_form_sleeveless?.length ? prims.dress_form_sleeveless : prims?.dress_form) || [];
  parts.forEach(({ geo, mat, local }) => {
    const m = new THREE.Mesh(geo, mat);
    m.applyMatrix4(local);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  });
  return g;
}
