import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { sniffKitAsset, validateKitAsset, decodeDataUrl, cleanFileName, KitAssetStore } from "./kit-asset-store";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(32, 2)]);
const woff2 = Buffer.concat([Buffer.from("wOF2", "latin1"), Buffer.alloc(32, 3)]);
const html = Buffer.from("<html><script>alert(1)</script></html>");

describe("kit asset checks", () => {
  it("sniffs logos and fonts by their bytes", () => {
    expect(sniffKitAsset(png)).toBe("image/png");
    expect(sniffKitAsset(ttf)).toBe("font/ttf");
    expect(sniffKitAsset(woff2)).toBe("font/woff2");
    expect(sniffKitAsset(html)).toBeNull();
  });

  it("only accepts the right kind", () => {
    expect(validateKitAsset("logo", png)).toBe("image/png");
    expect(validateKitAsset("font", ttf)).toBe("font/ttf");
    expect(() => validateKitAsset("logo", ttf)).toThrow();
    expect(() => validateKitAsset("font", png)).toThrow();
    expect(() => validateKitAsset("logo", html)).toThrow();
  });

  it("rejects files over the limit", () => {
    expect(() => validateKitAsset("logo", Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]))).toThrow(/3MB/);
  });

  it("decodes data URLs and rejects junk", () => {
    expect(decodeDataUrl(`data:image/png;base64,${png.toString("base64")}`).equals(png)).toBe(true);
    expect(() => decodeDataUrl("data:image/png;base64,<script>")).toThrow();
  });

  it("cleans file names", () => {
    expect(cleanFileName("../../etc/passwd", "x")).toBe("....etcpasswd");
    expect(cleanFileName("  ", "logo.png")).toBe("logo.png");
  });
});

describe("KitAssetStore", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kit-assets-")); process.env.UPLOAD_DIR = dir; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.UPLOAD_DIR; });

  it("stores by content hash, once", async () => {
    const store = new KitAssetStore();
    const a = await store.save("logo", png);
    const b = await store.save("logo", png);
    expect(a.url).toBe(b.url);
    expect(a.url).toMatch(/^\/uploads\/kit-assets\/logos\/[0-9a-f]{64}\.png$/);
    expect(readdirSync(join(dir, "kit-assets", "logos"))).toHaveLength(1);
    const f = await store.save("font", woff2);
    expect(f.url).toMatch(/\/fonts\/[0-9a-f]{64}\.woff2$/);
  });
});
