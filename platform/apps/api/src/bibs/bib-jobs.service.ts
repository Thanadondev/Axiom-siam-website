import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { OrderFilesService } from "../orders/order-files.service";
import { BibDesignSchema, type BibDesign } from "./design";
import { buildBibJob, logoArt, sponsorArt, teamFont, type BuiltJob } from "./job";
import { orderSheetSvg } from "./order-sheet";
import { pngSize } from "./draw";
import { BIB_SIZES, type BibSize } from "./template";
import { fitPng, PREVIEW_LOGO_PX } from "./raster";
import { kitBibDesign, kitLogoUrl, kitOnBib, kitRoster } from "./kit";
import { buildDesignerJob, designerRows, DesignerPrintSchema, type DesignerPrint } from "./designer-print";
import { fromDesigner } from "../orders/pricing";

/** what a web-designed bib order keeps on its items: enough to build the job again */
export interface BibSnapshot {
  kind: "bib-design";
  product: "bib_r" | "bib_n";
  team: string;
  design: BibDesign;
  /** the team's logo, uploaded by the kit studio (POST /kit-assets) */
  logoUrl?: string;
}

export const isBibSnapshot = (s: unknown): s is BibSnapshot => !!s && typeof s === "object" && (s as { kind?: unknown }).kind === "bib-design";

/** a logo the kit studio stored: the browser re-encodes every logo to PNG before upload */
const LOGO_URL = /^\/uploads\/kit-assets\/logos\/([a-f0-9]{64})\.png$/;
/** a team font the kit studio stored */
const FONT_URL = /^\/uploads\/kit-assets\/fonts\/([a-f0-9]{64}\.(?:ttf|otf|woff|woff2))$/;

/**
 * The print data an advanced-designer design carries (POST /designer-prints, kept
 * by its hash in the design as `printId`): with it the website makes the job.
 */
export function designerPrintId(s: unknown): string | null {
  if (!fromDesigner(s)) return null;
  const id = (s as { printId?: unknown }).printId;
  return typeof id === "string" && /^[a-f0-9]{64}$/.test(id) ? id : null;
}

/** an order whose print files the website makes: a bib designed on the web, a kit cut on the bib template, or an advanced design with its print data */
export const madeOnWeb = (s: unknown) => isBibSnapshot(s) || kitOnBib(s) || !!designerPrintId(s);

type OrderItems = { size: string; qty: number; roster: { playerName: string | null; number: string | null; qty: number }[] }[];

/**
 * Bibs designed on the website become the same job package the graphics team
 * makes by hand (bibs/job.ts), attached to the order as its print file. From
 * there it goes where a customer's own zip goes: the admin board, and the job
 * folder on the NAS once the order is paid.
 */
@Injectable()
export class BibJobService {
  private readonly log = new Logger("BibJobs");
  private readonly logos = resolve(process.env.UPLOAD_DIR ?? "./uploads", "kit-assets", "logos");
  private readonly fonts = resolve(process.env.UPLOAD_DIR ?? "./uploads", "kit-assets", "fonts");
  private readonly prints = resolve(process.env.UPLOAD_DIR ?? "./uploads", "designer-prints");

  /** keeps the advanced designer's print data (checked first), once per content; its id goes in the design */
  async savePrint(input: unknown): Promise<{ id: string; bytes: number; players: number }> {
    const p = DesignerPrintSchema.safeParse(input);
    if (!p.success) {
      const i = p.error.issues[0];
      throw new BadRequestException(`ข้อมูลไฟล์ผลิตไม่ถูกต้อง: ${i?.path.join(".") ?? ""} ${i?.message ?? ""}`.trim());
    }
    // every picture must be a PNG the job can print: found now, not once the order is placed
    for (const [i, b] of p.data.images.entries()) {
      try { pngSize(new Uint8Array(Buffer.from(b, "base64"))); } catch {
        throw new BadRequestException(`รูปที่ ${i + 1} ในแบบอ่านไม่ได้ — ลบรูปนั้นแล้วใส่ใหม่ (PNG / JPG)`);
      }
    }
    const buf = Buffer.from(JSON.stringify(p.data));
    const id = createHash("sha256").update(buf).digest("hex");
    await fs.mkdir(this.prints, { recursive: true });
    await fs.writeFile(resolve(this.prints, `${id}.json`), buf, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
    return { id, bytes: buf.length, players: p.data.players.length };
  }

  /** the print data a design points at */
  async loadPrint(id: string): Promise<DesignerPrint> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new BadRequestException("ไม่พบไฟล์ผลิตของแบบนี้");
    const buf = await fs.readFile(resolve(this.prints, `${id}.json`)).catch(() => null);
    if (!buf) throw new BadRequestException("ไม่พบไฟล์ผลิตของแบบนี้ — เปิดแบบแล้วกดสั่งผลิตอีกครั้ง");
    return DesignerPrintSchema.parse(JSON.parse(buf.toString("utf8")));
  }

  /**
   * Before an advanced design is ordered: its print data is there and has every
   * name on the order (a bib the designer never drew can't be printed).
   */
  async checkDesigner(snapshot: unknown, items: OrderItems) {
    const id = designerPrintId(snapshot);
    if (!id) return;
    const d = await this.loadPrint(id);
    try { designerRows(d, items); } catch {
      throw new BadRequestException("รายชื่อในออเดอร์ไม่ตรงกับแบบ — เปิดแบบแล้วกดสั่งผลิตอีกครั้ง");
    }
  }

  constructor(private prisma: PrismaService, private files: OrderFilesService) {}

  /** the team's logo bytes, from a URL the kit studio handed out; anything else is refused */
  async logo(url?: string | null): Promise<Uint8Array | undefined> {
    if (!url) return undefined;
    const m = LOGO_URL.exec(url);
    if (!m) throw new BadRequestException("โลโก้ต้องอัปโหลดผ่านหน้าออกแบบ (PNG)");
    const buf = await fs.readFile(resolve(this.logos, `${m[1]}.png`)).catch(() => null);
    if (!buf) throw new BadRequestException("ไม่พบไฟล์โลโก้ — อัปโหลดใหม่อีกครั้ง");
    pngSize(buf); // a real PNG
    return new Uint8Array(buf);
  }

  /** the team's font file, from a URL the kit studio handed out; missing or unknown is no font (the job notes it) */
  async font(url?: string | null): Promise<Uint8Array | undefined> {
    const m = url ? FONT_URL.exec(url) : null;
    if (!m) return undefined;
    const buf = await fs.readFile(resolve(this.fonts, m[1])).catch(() => null);
    return buf ? new Uint8Array(buf) : undefined;
  }

  /** the sponsors' logo bytes, from the design's URLs (checked as the team logo is) */
  async sponsors(d: BibDesign): Promise<{ left?: Uint8Array; right?: Uint8Array }> {
    return { left: await this.logo(d.sponsors.left), right: await this.logo(d.sponsors.right) };
  }

  /** the order sheet for one size, as SVG: the designer's live preview */
  async sheet(input: unknown, logoUrl: string | undefined, size?: string) {
    const p = BibDesignSchema.safeParse(input);
    if (!p.success) throw new BadRequestException(p.error.issues[0]?.message ?? "แบบไม่ถูกต้อง");
    const d = p.data;
    const counts: Partial<Record<BibSize, number>> = {};
    for (const r of d.roster) counts[r.size] = (counts[r.size] ?? 0) + 1;
    const z = (BIB_SIZES as readonly string[]).includes(size ?? "") ? (size as BibSize) : (BIB_SIZES.find(s => counts[s]) ?? "M");
    const row = d.roster.find(r => r.size === z) ?? d.roster[0];
    const full = await this.logo(logoUrl);
    const png = full ? fitPng(full, PREVIEW_LOGO_PX) : undefined;
    const logo = logoArt(d, png);
    // the team's own font, as the print files will set it (or the note saying it couldn't be read)
    const tf = teamFont(d, await this.font(d.fontUrl));
    const { svg } = orderSheetSvg(d, { font: tf.font ?? d.font, team: d.team, name: row.name, number: row.number, logo, show: d.show, logoLeft: d.logoLeft, numberCenter: d.numberCenter, sponsors: sponsorArt(await this.sponsors(d), PREVIEW_LOGO_PX) }, z, counts, { ref: "PREVIEW", date: new Date(), ...(tf.note ? { notes: [tf.note] } : {}) });
    return { svg, size: z, sizes: BIB_SIZES.filter(s => counts[s]) };
  }

  /**
   * Builds the order's job and attaches it as its print file, replacing an
   * earlier build that hasn't gone to the NAS yet. Called when the order is
   * placed, and by an admin to build it again.
   */
  async attach(orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNo: true, userId: true, createdAt: true, fabricSummary: true,
        items: { select: { designSnapshot: true, size: true, qty: true, roster: { select: { playerName: true, number: true, qty: true } } } },
        files: { select: { id: true, nasAt: true } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    const snap = o.items[0]?.designSnapshot;
    const printId = designerPrintId(snap);
    if (printId) {
      // an advanced design: drawn by the customer's browser, placed on each size here
      const d = await this.loadPrint(printId);
      const t1 = Date.now();
      // the fabric chosen at checkout ("N-bib · B1 · ขลิบ:full"): the print manager lays B1 / C1 out vertically
      const fabricId = ["mesh", "B1", "C1"].find(f => (o.fabricSummary ?? "").split(" · ").includes(f));
      return this.save(o, await buildDesignerJob(d, designerRows(d, o.items), { ref: o.orderNo, date: o.createdAt, fabricId }), t1);
    }
    let design: BibDesign, logoUrl: string | undefined;
    if (isBibSnapshot(snap)) { design = snap.design; logoUrl = snap.logoUrl; }
    else if (kitOnBib(snap)) {
      // a kit from the kit studio cut on the bib template (the basketball singlet): its pieces are the order's lines and names
      design = kitBibDesign(snap, kitRoster(snap, o.items));
      logoUrl = kitLogoUrl(snap);
    } else throw new BadRequestException("ออเดอร์นี้ไม่ได้ออกแบบบนเว็บ");
    const t0 = Date.now();
    const job = await buildBibJob(design, {
      ref: o.orderNo, date: o.createdAt,
      logoPng: await this.logo(logoUrl),
      fontData: await this.font(design.fontUrl),
      sponsorPngs: await this.sponsors(design),
    });
    return this.save(o, job, t0);
  }

  /** attaches a built job as the order's print file */
  private async save(o: { id: string; orderNo: string; userId: string; files: { id: string; nasAt: Date | null }[] }, job: BuiltJob, t0: number) {
    const saved = await this.files.saveGenerated(o.userId, o.id, `${job.name}.zip`, Buffer.from(job.zip), Buffer.from(job.preview));
    // an earlier build the team hasn't taken yet goes; one already on the NAS stays on record
    for (const f of o.files) if (!f.nasAt && f.id !== saved.id) await this.files.remove(f.id);
    this.log.log(`${o.orderNo}: built ${job.files.length} files in ${Date.now() - t0} ms${job.offChart.length ? ` · off-chart: ${job.offChart.join(", ")}` : ""}`);
    return { fileId: saved.id, name: job.name, files: job.files.length, offChart: job.offChart };
  }
}
