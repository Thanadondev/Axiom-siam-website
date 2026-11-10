import Link from "next/link";

export interface TemplateCardData {
  id: string;
  name: string;
  category?: string | null;
  price: number;
  previewUrl?: string | null;
  salesCount: number;
  designer?: { id: string; fullName?: string | null };
}

export const tplPrice = (n: number) => (n === 0 ? "ฟรี" : "฿" + n.toLocaleString("th-TH"));

/** one template in the marketplace grid: the print on paper, then who made it and the price */
export default function TemplateCard({ t, rank }: { t: TemplateCardData; rank?: number }) {
  return (
    <Link href={`/templates/${t.id}`} className="ax-mk-card">
      <div className="ax-mk-pic">
        {t.previewUrl ? <img src={t.previewUrl} alt="" loading="lazy" /> : <span className="ax-mono">NO PREVIEW</span>}
        {t.category && <span className="ax-mk-cat">{t.category}</span>}
        {rank !== undefined && <span className="ax-mk-rank">#{rank}</span>}
      </div>
      <div className="ax-mk-meta">
        <div>
          <b>{t.name}</b>
          <small>
            {t.designer ? `โดย ${t.designer.fullName || "ดีไซเนอร์"}` : ""}
            {t.salesCount ? `${t.designer ? " · " : ""}ขายแล้ว ${t.salesCount.toLocaleString("th-TH")}` : ""}
          </small>
        </div>
        <span className="ax-mk-price" data-free={t.price === 0 || undefined}>{tplPrice(t.price)}</span>
      </div>
    </Link>
  );
}
