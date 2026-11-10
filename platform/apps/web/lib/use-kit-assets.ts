"use client";

import { useEffect, useState } from "react";
import { getAsset, putAsset, registerFont, fontFormat, fetchAsDataUrl, uploadAsset, type DesignAssets, type KitAsset } from "./kit-assets";

/** the bits of a design that point at a team's own files */
export interface AssetRefs {
  logo?: string;
  logoTint?: boolean;
  fontAsset?: string;
  /** links to the files, when the design came from the account / an order */
  assets?: DesignAssets;
}

export interface ResolvedAssets {
  /** for JerseyLook: data URL, null (no logo) or undefined (Axiom mark) */
  logo: string | null | undefined;
  logoTint: boolean;
  fontFamily?: string;
  logoAsset?: KitAsset;
  fontAssetData?: KitAsset;
  /** a referenced file isn't on this device and couldn't be fetched */
  missing: ("logo" | "font")[];
}

/** this device's copy, else the one saved with the design (fetched once and kept here) */
async function resolveAsset(id: string, kind: "logo" | "font", saved?: { name: string; url?: string; data?: string }): Promise<KitAsset | null> {
  const local = await getAsset(id);
  if (local) return local;
  if (!saved) return null;
  let data = saved.data && saved.data.startsWith(kind === "logo" ? "data:image/" : "data:font/") ? saved.data : undefined;
  if (!data && saved.url) {
    try { data = await fetchAsDataUrl(saved.url); } catch { return null; }
    // a font fetched from the server comes back as a generic type: label it for FontFace
    if (kind === "font" && data && !data.startsWith("data:font/")) data = data.replace(/^data:[^;,]*/, "data:font/" + (saved.url.split(".").pop() || "ttf"));
  }
  if (!data) return null;
  const a: KitAsset = { id, kind, name: saved.name || (kind === "logo" ? "logo.png" : "font"), data, url: saved.url, created: Date.now() };
  putAsset(a).catch(() => {});
  return a;
}

/**
 * Turns a design's logo/font references into what the 3D jersey needs: the logo
 * image and a registered font family.
 */
export function useKitAssets(ref: AssetRefs): ResolvedAssets {
  const [logoAsset, setLogoAsset] = useState<KitAsset | undefined>();
  const [fontAsset, setFontAsset] = useState<KitAsset | undefined>();
  const [family, setFamily] = useState<string | undefined>();
  const [missing, setMissing] = useState<("logo" | "font")[]>([]);
  const logoId = ref.logo && ref.logo.startsWith("logo-") ? ref.logo : undefined;
  const fontId = ref.fontAsset;
  const savedLogo = ref.assets?.logo;
  const savedFont = ref.assets?.font;
  const logoKey = savedLogo?.url ?? savedLogo?.data?.slice(0, 64);
  const fontKey = savedFont?.url ?? savedFont?.data?.slice(0, 64);

  useEffect(() => {
    let live = true;
    if (!logoId) { setLogoAsset(undefined); setMissing(m => m.filter(x => x !== "logo")); return; }
    resolveAsset(logoId, "logo", savedLogo).then(a => {
      if (!live) return;
      setLogoAsset(a ?? undefined);
      setMissing(m => (a ? m.filter(x => x !== "logo") : Array.from(new Set([...m, "logo" as const]))));
    });
    return () => { live = false; };
  }, [logoId, logoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    if (!fontId) { setFontAsset(undefined); setFamily(undefined); setMissing(m => m.filter(x => x !== "font")); return; }
    (async () => {
      const a = await resolveAsset(fontId, "font", savedFont);
      const fam = a ? await registerFont(a) : null;
      if (!live) return;
      setFontAsset(a ?? undefined);
      setFamily(fam ?? undefined);
      setMissing(m => (fam ? m.filter(x => x !== "font") : Array.from(new Set([...m, "font" as const]))));
    })();
    return () => { live = false; };
  }, [fontId, fontKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const logo = ref.logo === "none" ? null : logoId ? logoAsset?.data ?? undefined : undefined;
  return { logo, logoTint: !!ref.logoTint, fontFamily: family, logoAsset, fontAssetData: fontAsset, missing };
}

/**
 * Uploads the design's logo/font (once each) and returns the links to save with the
 * design, so the account and the factory have the files without the design carrying them.
 */
export async function uploadDesignAssets(r: ResolvedAssets, token: string): Promise<DesignAssets | undefined> {
  const out: DesignAssets = {};
  if (r.logoAsset) out.logo = { name: r.logoAsset.name, url: await uploadAsset(r.logoAsset, token) };
  if (r.fontAssetData) out.font = { name: r.fontAssetData.name, url: await uploadAsset(r.fontAssetData, token), format: fontFormat(r.fontAssetData.data) };
  return out.logo || out.font ? out : undefined;
}
