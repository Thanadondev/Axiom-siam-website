import type { Kit, KitColors, PatternId } from "../lib/kits";

/**
 * Flat jersey drawing in a kit's colours. Used for collection cards and as the
 * stand-in wherever WebGL isn't available, so the page still shows the shirt.
 */
export default function KitThumb({
  kit, colors, pattern, number, label, style,
}: {
  kit: Kit;
  colors?: KitColors;
  pattern?: PatternId;
  number?: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const c = colors ?? kit.defaults.colors;
  const p = pattern ?? kit.defaults.pattern;
  if (kit.garment === "shorts") return <ShortsThumb id={kit.id} c={c} p={p} number={number} label={label} style={style} />;
  if (kit.garment === "hoodie") return <HoodieThumb id={kit.id} c={c} p={p} number={number} label={label} style={style} />;
  const sleeved = kit.cut.sleeves === "short";
  const v = kit.cut.neck === "v";
  return (
    <svg viewBox="0 0 400 440" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: "block", width: "100%", height: "auto", ...style }}>
      {sleeved && (
        <>
          <path d="M120 40 L40 92 L72 172 L104 152 L104 120 Z" fill={c.sleeve} />
          <path d="M280 40 L360 92 L328 172 L296 152 L296 120 Z" fill={c.sleeve} />
          <path d="M40 92 L52 86 L84 166 L72 172 Z" fill={c.trim} />
          <path d="M360 92 L348 86 L316 166 L328 172 Z" fill={c.trim} />
        </>
      )}
      <path
        d={sleeved
          ? "M120 40 L160 30 Q200 64 240 30 L280 40 L300 120 L304 412 Q200 430 96 412 L100 120 Z"
          : "M140 32 L166 28 Q200 62 234 28 L260 32 Q262 112 312 140 L316 412 Q200 430 84 412 L88 140 Q138 112 140 32 Z"}
        fill={c.body}
      />
      {p === "diagonal" && <path d="M100 280 L302 204 L302 246 L100 322 Z" fill={c.stripe} />}
      {p === "chest" && <path d="M92 168 L308 168 L308 206 L92 206 Z" fill={c.stripe} />}
      {p === "side" && (<><path d="M86 150 L120 150 L120 414 L86 414 Z" fill={c.stripe} /><path d="M280 150 L314 150 L314 414 L280 414 Z" fill={c.stripe} /></>)}
      {p === "pin" && <path d="M142 60 L150 60 L150 418 L142 418 Z M180 70 L188 70 L188 420 L180 420 Z M212 70 L220 70 L220 420 L212 420 Z M250 60 L258 60 L258 418 L250 418 Z" fill={c.stripe} />}
      {p === "hoops" && <path d="M96 150 L304 150 L304 190 L96 190 Z M98 240 L306 240 L306 280 L98 280 Z M98 330 L308 330 L308 370 L98 370 Z" fill={c.stripe} />}
      <path d={v ? "M160 30 L200 96 L240 30 L230 26 L200 76 L170 26 Z" : "M158 28 Q200 72 242 28 L232 22 Q200 54 168 22 Z"} fill={c.trim} />
      <path d="M200 66 L200 424 Q150 424 96 412 L100 120 L120 40 L160 30 Q180 52 200 66 Z" fill="#000" opacity="0.12" />
      {number && (
        <text x="246" y="152" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="44" fill={c.number}>{number}</text>
      )}
    </svg>
  );
}

interface ThumbProps { id: string; c: KitColors; p: PatternId; number?: string; label?: string; style?: React.CSSProperties }

/** the pattern as stripes over a 400×440 box, for clipping to a garment's outline */
function Stripes({ p, color }: { p: PatternId; color: string }) {
  if (p === "diagonal") return <path d="M40 300 L360 190 L360 236 L40 346 Z" fill={color} />;
  if (p === "chest") return <path d="M40 170 L360 170 L360 210 L40 210 Z" fill={color} />;
  if (p === "side") return <path d="M0 0 L112 0 L84 440 L0 440 Z M288 0 L400 0 L400 440 L316 440 Z" fill={color} />;
  if (p === "pin") return <path d="M142 0 L150 0 L150 440 L142 440 Z M180 0 L188 0 L188 440 L180 440 Z M212 0 L220 0 L220 440 L212 440 Z M250 0 L258 0 L258 440 L250 440 Z" fill={color} />;
  if (p === "hoops") return <path d="M0 150 L400 150 L400 190 L0 190 Z M0 240 L400 240 L400 280 L0 280 Z M0 330 L400 330 L400 370 L0 370 Z" fill={color} />;
  return null;
}

function svgProps(label?: string, style?: React.CSSProperties) {
  return {
    viewBox: "0 0 400 440",
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: { display: "block", width: "100%", height: "auto", ...style },
  } as const;
}

function HoodieThumb({ id, c, p, number, label, style }: ThumbProps) {
  const body = "M118 46 L160 36 Q200 72 240 36 L282 46 L302 132 L302 384 L98 384 L98 132 Z";
  const clip = `kt-${id}-body`;
  return (
    <svg {...svgProps(label, style)}>
      <defs><clipPath id={clip}><path d={body} /></clipPath></defs>
      {/* the hood lying behind the neck */}
      <path d="M140 52 Q146 6 200 4 Q254 6 260 52 Q236 30 200 30 Q164 30 140 52 Z" fill={c.body} />
      <path d="M140 52 Q146 6 200 4 Q254 6 260 52 Q236 30 200 30 Q164 30 140 52 Z" fill="#000" opacity="0.2" />
      {/* long sleeves with rib cuffs */}
      <path d="M118 46 L70 92 L36 330 L88 338 L106 176 Z" fill={c.sleeve} />
      <path d="M282 46 L330 92 L364 330 L312 338 L294 176 Z" fill={c.sleeve} />
      <path d="M36 330 L88 338 L85 372 L32 364 Z M364 330 L312 338 L315 372 L368 364 Z" fill={c.trim} />
      <path d={body} fill={c.body} />
      <g clipPath={`url(#${clip})`}><Stripes p={p} color={c.stripe} /></g>
      {/* kangaroo pocket */}
      <path d="M136 292 L264 292 Q272 330 290 384 L110 384 Q128 330 136 292 Z" fill="#000" opacity="0.1" />
      <path d="M136 292 L264 292" stroke="#000" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M98 384 L302 384 L298 426 L102 426 Z" fill={c.trim} />
      {/* the hood's edge round the neck, and its cords */}
      <path d="M156 34 Q200 84 244 34" fill="none" stroke={c.trim} strokeWidth="9" strokeLinecap="round" />
      <path d="M188 70 L184 176 M212 70 L216 168" stroke={c.trim} strokeWidth="5" strokeLinecap="round" />
      <path d="M200 70 L200 384 L98 384 L98 132 L118 46 L160 36 Q180 56 200 70 Z" fill="#000" opacity="0.1" />
      {number && <text x="250" y="160" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="40" fill={c.number}>{number}</text>}
    </svg>
  );
}

function ShortsThumb({ id, c, p, number, label, style }: ThumbProps) {
  const legs = "M86 84 L314 84 L344 392 L214 404 L200 236 L186 404 L56 392 Z";
  const clip = `kt-${id}-legs`;
  return (
    <svg {...svgProps(label, style)}>
      <defs><clipPath id={clip}><path d={legs} /></clipPath></defs>
      <path d={legs} fill={c.body} />
      <g clipPath={`url(#${clip})`}><Stripes p={p} color={c.stripe} /></g>
      <path d="M56 392 L186 404 L185 428 L54 416 Z M344 392 L214 404 L215 428 L346 416 Z" fill={c.trim} />
      <path d="M84 34 L316 34 L314 84 L86 84 Z" fill={c.trim} />
      <path d="M84 34 L316 34 L314 84 L86 84 Z" fill="#000" opacity="0.08" />
      {/* the drawcord tied at the front */}
      <path d="M194 62 Q186 96 178 122 M206 62 Q214 96 224 118" stroke={c.number} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M200 236 L186 404 L56 392 L86 84 L200 84 Z" fill="#000" opacity="0.1" />
      {number && <text x="270" y="356" textAnchor="middle" fontFamily="Anton, sans-serif" fontSize="40" fill={c.number}>{number}</text>}
    </svg>
  );
}
