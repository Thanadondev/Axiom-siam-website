import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { promises as fs } from "fs";
import { resolve } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { OrderFilesService } from "../orders/order-files.service";
import { BibDesignSchema, type BibDesign } from "./design";
import { buildBibJob } from "./job";
import { orderSheetSvg } from "./order-sheet";
import { pngSize } from "./draw";
import { BIB_SIZES, type BibSize } from "./template";

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

  /** the order sheet for one size, as SVG: the designer's live preview */
  async sheet(input: unknown, logoUrl: string | undefined, size?: string) {
    const p = BibDesignSchema.safeParse(input);
    if (!p.success) throw new BadRequestException(p.error.issues[0]?.message ?? "แบบไม่ถูกต้อง");
    const d = p.data;
    const counts: Partial<Record<BibSize, number>> = {};
    for (const r of d.roster) counts[r.size] = (counts[r.size] ?? 0) + 1;
    const z = (BIB_SIZES as readonly string[]).includes(size ?? "") ? (size as BibSize) : (BIB_SIZES.find(s => counts[s]) ?? "M");
    const row = d.roster.find(r => r.size === z) ?? d.roster[0];
    const png = await this.logo(logoUrl);
    const logo = png ? { png, ...pngSize(png) } : undefined;
    const { svg } = orderSheetSvg(d, { font: d.font, team: d.team, name: row.name, number: row.number, logo, show: d.show }, z, counts, { ref: "PREVIEW", date: new Date() });
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
        id: true, orderNo: true, userId: true, createdAt: true,
        items: { select: { designSnapshot: true }, take: 1 },
        files: { select: { id: true, nasAt: true } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    const snap = o.items[0]?.designSnapshot;
    if (!isBibSnapshot(snap)) throw new BadRequestException("ออเดอร์นี้ไม่ได้ออกแบบเอี๊ยมบนเว็บ");
    const t0 = Date.now();
    const job = await buildBibJob(snap.design, { ref: o.orderNo, date: o.createdAt, logoPng: await this.logo(snap.logoUrl) });
    const saved = await this.files.saveGenerated(o.userId, o.id, `${job.name}.zip`, Buffer.from(job.zip), Buffer.from(job.preview));
    // an earlier build the team hasn't taken yet goes; one already on the NAS stays on record
    for (const f of o.files) if (!f.nasAt && f.id !== saved.id) await this.files.remove(f.id);
    this.log.log(`${o.orderNo}: built ${job.files.length} files in ${Date.now() - t0} ms${job.offChart.length ? ` · off-chart: ${job.offChart.join(", ")}` : ""}`);
    return { fileId: saved.id, name: job.name, files: job.files.length, offChart: job.offChart };
  }
}
