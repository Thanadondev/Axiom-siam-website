import { Injectable, Logger, NotFoundException, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createHash } from "crypto";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { PrismaService } from "../prisma/prisma.service";
import { OrderFilesService } from "./order-files.service";
import { keyOf } from "./blob-store";
import { KITS_ON_BIB, kitOnBib } from "../bibs/kit";

/**
 * The graphics team works from job folders on the NAS (\\SynologyNAS\Axiom Siam),
 * one folder per job. Once a bib order by zip is paid, a copy of the customer's zip
 * goes into its own folder under NAS_JOBS_DIR (the team's @graphic\_webjobs):
 *
 *   AX-261110-6U5T R-bib (ML) J-Field Axis\HF-100 (N) 4379 J-Field Axis R bib (ML).zip
 *
 * The zip as it came (not unzipped). Written as ".part" then renamed, so the team
 * never opens half a file. When the NAS is away, it's tried again every couple of
 * minutes; the production board can also send it now. Off when NAS_JOBS_DIR is unset.
 *
 * A web-designed job built again after it went (POST /admin/orders/:id/bib-job) has
 * the same name: its zip replaces the one in the folder, and the print manager sees
 * the new zip and makes the print files again.
 *
 * An order that ships to the agent in Japan also gets a note beside its zip
 * (AGENT_NOTE), so whoever packs it from the job folder sees where it goes.
 */

/** the note in an agent order's job folder; the print manager reads only the zips */
export const AGENT_NOTE = "ส่งถึง - ตัวแทนญี่ปุ่น.txt";

export function agentNote(orderNo: string, d: { name?: string; phone?: string; address?: string }) {
  return [
    `${orderNo} — ส่งรวมผ่านตัวแทนในญี่ปุ่น (ไม่ส่งถึงลูกค้าโดยตรง)`,
    `日本の代理店へまとめて発送`,
    "",
    [d.name, d.phone].filter(Boolean).join(" · "),
    d.address ?? "",
    "",
  ].join("\r\n"); // Windows line ends: it is opened in Notepad on the team's PCs
}

/** the file at `path` already holds these bytes (same size and SHA-256) */
async function sameFile(path: string, f: { bytes: number; sha256: string | null }) {
  const st = await fs.stat(path).catch(() => null);
  if (!st?.isFile() || st.size !== f.bytes) return false;
  if (!f.sha256) return true;
  const h = createHash("sha256");
  await pipeline(createReadStream(path), h);
  return h.digest("hex") === f.sha256;
}

/** sizes as the team writes them in job names: "S", "ML", "SML XL", "XL"; then XXL and the specials (SPM, SPL) */
export function sizeLabel(sizes: string[]) {
  const has = new Set(sizes);
  const small = ["S", "M", "L"].filter(s => has.has(s)).join("");
  return [small, ...["XL", "XXL", "SPM", "SPL"].filter(s => has.has(s))].filter(Boolean).join(" ");
}

/** a folder or file name Windows and the NAS accept: no \ / : * ? " < > |, no trailing dots or spaces */
export function safeName(raw: string, max = 120) {
  const s = raw.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return (s.length > max ? s.slice(0, max).trim() : s) || "order";
}

const PRODUCT: Record<string, string> = { bib_n: "N-bib", bib_r: "R-bib" };

/** "AX-261110-6U5T R-bib (ML) J-Field Axis" */
export function jobFolderName(o: { orderNo: string; product?: string | null; sizes: string[]; team?: string | null }) {
  const parts = [o.orderNo, o.product ? PRODUCT[o.product] ?? o.product : "", o.sizes.length ? `(${sizeLabel(o.sizes)})` : "", o.team ?? ""];
  return safeName(parts.filter(Boolean).join(" "));
}

/** an order that has been paid for: from "paid" on, not cancelled or refunded */
const PAID_ON = ["paid", "approved", "in_production", "shipped", "delivered", "completed"] as const;

@Injectable()
export class NasExportService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("NAS");
  private timer?: NodeJS.Timeout;
  private running = false;
  /** the NAS folder new jobs go into; null = off */
  readonly root: string | null = process.env.NAS_JOBS_DIR?.trim() || null;

  constructor(private prisma: PrismaService, private files: OrderFilesService) {}

  onModuleInit() {
    if (!this.root || process.env.NODE_ENV === "test") return;
    this.log.log(`paid orders' zips are copied to ${this.root}`);
    const run = () => void this.sweep().catch(e => this.log.warn(`sweep failed: ${e?.message ?? e}`));
    setTimeout(run, 15_000).unref?.();
    this.timer = setInterval(run, 2 * 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** every paid order whose zip isn't on the NAS yet */
  async sweep() {
    if (!this.root || this.running) return { copied: 0, failed: 0 };
    this.running = true;
    let copied = 0, failed = 0;
    try {
      const waiting = await this.prisma.orderFile.findMany({
        where: { nasAt: null, orderId: { not: null }, order: { status: { in: [...PAID_ON] } } },
        select: { orderId: true },
        take: 50,
      });
      for (const orderId of [...new Set(waiting.map(w => w.orderId!))]) {
        const r = await this.exportOrder(orderId).catch(e => ({ ok: false as const, error: String(e?.message ?? e) }));
        if (r.ok) copied++; else failed++;
      }
      if (failed) this.log.warn(`${failed} order(s) not copied to the NAS yet — will try again`);
    } finally { this.running = false; }
    return { copied, failed };
  }

  /** copies one paid order's zip(s) into its job folder; safe to call again */
  async exportOrder(orderId: string): Promise<{ ok: true; folder: string; copied: number } | { ok: false; error: string }> {
    if (!this.root) return { ok: false, error: "ยังไม่ได้ตั้ง NAS_JOBS_DIR ใน .env ของ API" };
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNo: true, status: true, delivery: true,
        user: { select: { fullName: true, companyName: true } },
        items: { select: { size: true, qty: true, designSnapshot: true } },
        files: { select: { id: true, name: true, path: true, bytes: true, sha256: true, createdAt: true, nasAt: true, nasPath: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!o) throw new NotFoundException("ไม่พบออเดอร์");
    if (!(PAID_ON as readonly string[]).includes(o.status)) return { ok: false, error: "ออเดอร์นี้ยังไม่ชำระเงิน" };
    if (!o.files.length) return { ok: false, error: "ออเดอร์นี้ไม่มีไฟล์งาน" };

    const snap = o.items[0]?.designSnapshot as { product?: string; team?: string } | null;
    // a job the website built ("AX-… R-bib (M) team") names its own folder: an advanced design keeps
    // its product and team in its print data, not in the order, which only knew the customer's company
    const built = [...o.files].reverse().find(f => f.name.startsWith(`${o.orderNo} `) && /\.zip$/i.test(f.name));
    const folder = built ? safeName(built.name.replace(/\.zip$/i, "")) : jobFolderName({
      orderNo: o.orderNo,
      // a kit from the kit studio cut on the bib template is named by its code ("BK-03")
      product: snap?.product ?? (kitOnBib(snap) ? KITS_ON_BIB[snap.kit.toLowerCase()].code : null),
      sizes: o.items.filter(i => i.qty > 0).map(i => i.size),
      // a bib designed on the web carries the team's own name; otherwise the customer's
      team: snap?.team || o.user.companyName || o.user.fullName,
    });
    // the NAS folder is there (we never create the share or _webjobs ourselves)
    if (!(await fs.stat(this.root).then(s => s.isDirectory(), () => false))) return { ok: false, error: `ส่งเข้า NAS ไม่ได้: เข้าถึง ${this.root} ไม่ได้` };
    try {
      const dir = join(this.root, folder);
      await fs.mkdir(dir, { recursive: true });
      let copied = 0;
      const sent = o.files.filter(f => f.nasAt);
      for (const f of o.files) {
        if (f.nasAt) continue;
        const base = safeName(f.name, 150).replace(/(\.zip)?$/i, ".zip");
        // a name one of this order's files already went under: a build made after that one
        // went replaces it; a file that came with it (two uploads, one name) goes beside it
        let name = base;
        for (let n = 2; ; n++) {
          const holder = sent.find(x => x.nasPath === join(folder, name));
          if (!holder || holder.nasAt! < f.createdAt) break;
          name = base.replace(/\.zip$/i, ` (${n}).zip`);
        }
        const dest = join(dir, name);
        if (!(await sameFile(dest, f))) {
          const replacing = await fs.stat(dest).then(s => s.isFile(), () => false);
          const part = `${dest}.part`;
          try {
            await pipeline(await this.files.openStored(f.path), createWriteStream(part));
            await fs.rename(part, dest); // over the old zip, if there is one
          } catch (e) {
            await fs.rm(part, { force: true });
            throw e;
          }
          if (replacing) this.log.log(`${o.orderNo}: ${name} replaced with a newer build`);
          copied++;
        }
        const nasAt = new Date(), nasPath = join(folder, name);
        await this.prisma.orderFile.update({ where: { id: f.id }, data: { nasPath, nasAt } });
        sent.push({ ...f, nasPath, nasAt });
      }
      const d = o.delivery as { mode?: string; name?: string; phone?: string; address?: string } | null;
      if (d?.mode === "agent") {
        const note = join(dir, AGENT_NOTE), text = agentNote(o.orderNo, d);
        if ((await fs.readFile(note, "utf8").catch(() => "")) !== text) await fs.writeFile(note, text, "utf8");
      }
      this.log.log(`${o.orderNo} → ${folder} (${copied} file${copied === 1 ? "" : "s"})`);
      return { ok: true, folder, copied };
    } catch (e: any) {
      return { ok: false, error: `ส่งเข้า NAS ไม่ได้: ${e?.message ?? e}` };
    }
  }
}
