/* Axiom Siam — Illustrator-style vector designer (Fabric.js) */
const ART = { w: 820, h: 1040 };
const MM_PER_UNIT = 1.86347;      // จาก sizes.js: 1 หน่วย viewBox = 1.86347 มม. (สเกลจริง)
const PX_PER_CM = 10 / MM_PER_UNIT; // = หน่วยต่อ 1 ซม. (5.3663)
let SHEET_W_CM = 155;
const TPL = {
  front: "M 295,175 L 185,215 L 210,300 L 300,318 L 320,885 Q 410,910 500,885 L 520,318 L 610,300 L 635,215 L 525,175 Q 410,242 295,175 Z",
  back:  "M 295,175 L 185,215 L 210,300 L 300,318 L 320,885 Q 410,910 500,885 L 520,318 L 610,300 L 635,215 L 525,175 Q 410,205 295,175 Z",
};
const PALETTE = (window.AXIOM_PALETTE || []).map(p => p.c);
const PALINFO = window.AXIOM_PALETTE || [];

let canvas, curTool = "select", fillTarget = "fill";
let history = [], hIndex = -1, restoring = false;

const $ = s => document.querySelector(s);
const stage = $("#stage");
window.addEventListener("error", ev => { const h = document.getElementById("hint"); if (h) { h.style.color = "#ff6b6b"; h.textContent = "ERROR: " + (ev.message || (ev.error && ev.error.message) || ev); } });

/* ---------- right panel markup ---------- */
$("#right").innerHTML = `
  <div class="panel">
    <div class="phead">ข้อมูลกระดาษ</div>
    <div class="pbody"><div id="infoBox" style="font-size:12px;color:var(--txt)"></div></div>
  </div>
  <div class="panel">
    <div class="phead">✂ เส้นตัดเลเซอร์ (งานแนวตั้ง)</div>
    <div class="pbody">
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--txt);margin-bottom:9px"><input type="checkbox" id="cutOn" checked> แสดงเส้นตัดเลเซอร์</label>
      <div class="row" style="display:flex;align-items:center;gap:8px"><label style="min-width:60px;font-size:11.5px;color:var(--muted)">ระยะเผื่อ</label><input type="range" id="cutMm" min="2" max="25" step="1" value="7" style="flex:1"><span id="cutMmV" style="min-width:42px;font-size:11px;color:var(--muted)">7 มม.</span></div>
      <div style="font-size:11px;color:var(--muted);margin-top:7px;line-height:1.5">เส้นสีดำ = แนวตัดเลเซอร์รอบตัวเสื้อ (เผื่อตะเข็บ) แสดงเฉพาะงาน “มีขลิบ / แนวตั้ง” และติดไปในไฟล์ SVG</div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">🧾 New Order · รีออเดอร์ทีม</div>
    <div class="pbody">
      <button class="mini" id="wizOpen" style="width:100%;box-sizing:border-box;margin-bottom:7px;background:#2563eb;color:#fff;border-color:transparent;height:40px;font-weight:700;font-size:13px">🧾 สร้างออเดอร์ทีม (ง่ายๆ)</button>
      <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:8px">ทำทีละขั้น: เลือกแบบ → ใส่รายชื่อ → วางชื่อ-เบอร์อัตโนมัติ → สร้างไฟล์/บันทึก</div>
      <div id="advToggle" style="font-size:11px;color:#2563eb;cursor:pointer;margin-bottom:8px;user-select:none">⚙ เครื่องมือขั้นสูง (ทำเอง) ▾</div>
      <div id="rosterAdv" style="display:none">
      <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:7px">1) คลิกข้อความบนเสื้อ แล้วแท็กเป็นช่อง “ชื่อ” หรือ “เบอร์” — ทำได้ทั้งหน้าและหลัง</div>
      <div class="btnrow" style="margin-bottom:5px">
        <button class="mini" id="tagName" title="ตั้งข้อความที่เลือกให้เป็นช่องชื่อผู้เล่น">🏷 ช่องชื่อ</button>
        <button class="mini" id="tagNumber" title="ตั้งข้อความที่เลือกให้เป็นช่องเบอร์">#️⃣ ช่องเบอร์</button>
        <button class="mini" id="tagClear" title="ล้างแท็กออกจากข้อความที่เลือก">✕</button>
      </div>
      <div id="tagInfo" style="font-size:11px;color:var(--muted);margin-bottom:7px"></div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">จัดตำแหน่งบนเสื้อ (เลือกข้อความก่อน):</div>
      <div class="btnrow" style="margin-bottom:5px">
        <button class="mini" id="posCenter" title="จัดกึ่งกลางแนวนอนบนตัวเสื้อ">↔ กลาง</button>
        <button class="mini" id="posNameTop" title="วางไว้บน (ชื่อด้านหลัง)">ชื่อบน</button>
        <button class="mini" id="posNumChest" title="วางที่อก (เบอร์หน้า)">เบอร์อก</button>
      </div>
      <div class="btnrow" style="margin-bottom:9px">
        <button class="mini" id="posNumBig" title="วางกลางลำตัว (เบอร์ใหญ่หลัง)">เบอร์กลาง</button>
        <button class="mini" id="posNameBot" title="วางไว้ล่าง (ชื่อ/ทีมด้านล่าง)">ชื่อล่าง</button>
        <button class="mini" id="posHint" title="คีย์ลัด">⌨ คีย์ลัด</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">2) วางรายชื่อจาก Excel — 1 บรรทัด/คน · คั่นด้วย Tab หรือ , : <b>ชื่อ, เบอร์, ไซซ์</b></div>
      <textarea id="rosterText" rows="6" placeholder="สมชาย	10	L&#10;สมหญิง	7	M&#10;อาทิตย์	23	XL" spellcheck="false" style="width:100%;box-sizing:border-box;resize:vertical;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:7px 8px;color:var(--txt);font-size:12px;font-family:inherit;line-height:1.55"></textarea>
      <div id="rosterCount" style="font-size:11px;color:var(--muted);margin:6px 0"></div>
      <div class="row" style="margin-bottom:8px;display:flex;align-items:center;gap:7px"><label style="min-width:64px;font-size:11.5px;color:var(--muted)">ชื่อออเดอร์</label><input type="text" id="orderName" placeholder="เช่น SAKURAGI ทีม A" style="flex:1"></div>
      <div class="btnrow" style="margin-bottom:6px">
        <button class="mini" id="rosterPreview" title="ดูตัวอย่างชื่อคนแรกบนเสื้อ">👁 ดูตัวอย่าง</button>
        <button class="mini" id="rosterReset" title="คืนค่าเทมเพลตเดิม">↺ คืนค่า</button>
      </div>
      <button class="mini" id="rosterGen" style="width:100%;box-sizing:border-box;margin-bottom:6px;background:#2563eb;color:#fff;border-color:transparent;height:34px;font-weight:700">⚙ สร้างทั้งทีม → ZIP</button>
      <button class="mini" id="rosterSave" style="width:100%;box-sizing:border-box;height:32px">💾 บันทึกออเดอร์เข้าบัญชี</button>
      <div id="rosterProg" style="font-size:11px;color:var(--muted);margin-top:8px"></div>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Appearance</div>
    <div class="pbody">
      <div class="row" id="fontRow" style="display:none;margin-bottom:10px"><label>ฟอนต์</label><select id="fontSel" style="flex:1;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:6px 8px;color:var(--txt);font-size:12px;font-family:inherit"></select></div>
      <div class="fillbox" style="margin-bottom:10px">
        <button class="swbtn on" id="fillBtn"><span class="chip" id="fillChip"></span>Fill</button>
        <button class="swbtn" id="strokeBtn"><span class="chip" id="strokeChip"></span>Stroke</button>
      </div>
      <div class="row"><label>เส้นขอบ</label><div class="num" style="flex:1"><input type="range" id="swRange" min="0" max="40" step="0.5" value="0"><span id="swVal" style="min-width:26px">0</span></div></div>
      <div class="row"><label>ความทึบ</label><div class="num" style="flex:1"><input type="range" id="opRange" min="0" max="100" value="100"><span id="opVal" style="min-width:26px">100</span></div></div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Transform</div>
    <div class="pbody">
      <div class="grid2" style="margin-bottom:7px">
        <div class="num"><span>W</span><input type="number" id="tW"></div>
        <div class="num"><span>H</span><input type="number" id="tH"></div>
      </div>
      <div class="num" style="margin-bottom:9px"><span>∠</span><input type="number" id="tR" placeholder="องศา"></div>
      <div class="btnrow" style="margin-bottom:7px">
        <button class="mini" data-align="left" title="ชิดซ้าย">⬅</button>
        <button class="mini" data-align="cx" title="กึ่งกลางแนวนอน">↔</button>
        <button class="mini" data-align="right" title="ชิดขวา">➡</button>
        <button class="mini" data-align="top" title="ชิดบน">⬆</button>
        <button class="mini" data-align="cy" title="กึ่งกลางแนวตั้ง">↕</button>
        <button class="mini" data-align="bottom" title="ชิดล่าง">⬇</button>
      </div>
      <div class="btnrow">
        <button class="mini" data-arrange="front" title="บนสุด">⤒</button>
        <button class="mini" data-arrange="forward" title="ขึ้นหนึ่งชั้น">↑</button>
        <button class="mini" data-arrange="backward" title="ลงหนึ่งชั้น">↓</button>
        <button class="mini" data-arrange="back" title="ล่างสุด">⤓</button>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">🎽 สีตัวเสื้อ</div>
    <div class="pbody">
      <div class="btnrow" style="margin-bottom:7px">
        <input type="color" id="bodyPick" style="width:40px;height:30px;border:0;background:none;padding:0" title="เลือกสีเอง">
        <button class="mini" id="bodyWhite" title="ขาว">ขาว</button>
        <span class="swcode" id="bodyCode" style="align-self:center"></span>
      </div>
      <div class="swatches" id="bodyGrid"></div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">สีขลิบ (คอ/แขน/ชาย)</div>
    <div class="pbody">
      <div class="btnrow" style="margin-bottom:7px">
        <input type="color" id="trimPick" style="width:40px;height:30px;border:0;background:none;padding:0" title="เลือกสีเอง">
        <span class="swcode" id="trimCode" style="align-self:center"></span>
      </div>
      <div class="swatches" id="trimGrid"></div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">ลายเต็มตัว (Sublimation)</div>
    <div class="pbody">
      <div class="btnrow">
        <button class="mini" id="patUp" title="อัปโหลดลาย (คลิปเข้าทรงเสื้อ)">⬆ อัปโหลดลาย</button>
        <button class="mini" id="patClr" title="ล้างลาย">✕ ล้างลาย</button>
      </div>
      <div class="row" style="margin-top:8px;display:flex;align-items:center;gap:8px"><label style="min-width:52px;font-size:11.5px;color:var(--muted)">ขนาดลาย</label><input type="range" id="patSize" min="0.4" max="2.4" step="0.1" value="1" style="flex:1"><span id="patSizeV" style="min-width:28px;font-size:11px;color:var(--muted)">1.0×</span></div>
      <label style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);margin:2px 0 6px"><input type="checkbox" id="patBrand"> ใช้สีแบรนด์ (ตามสีตัวเสื้อ/ขลิบ)</label>
      <div class="patgrid" id="patGrid"></div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Swatches · สีวัตถุ</div>
    <div class="pbody">
      <div class="swtarget">
        <button id="tgtFill" class="on">พื้น (Fill)</button>
        <button id="tgtStroke">ขอบ (Stroke)</button>
      </div>
      <div class="btnrow" style="margin-bottom:8px">
        <button class="mini" id="swNone" title="ไม่มีสี">∅ None</button>
        <input type="color" id="swPick" style="width:38px;height:32px;border:0;background:none;padding:0" title="เลือกสีเอง">
      </div>
      <div class="swatches" id="swGrid"></div>
      <div class="swcode" id="swCode"></div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Layers</div>
    <div class="pbody">
      <div class="btnrow" style="margin-bottom:6px">
        <button class="mini" id="btnCopy" title="คัดลอก (Ctrl+C)">⧉ คัดลอก</button>
        <button class="mini" id="btnPaste" title="วาง (Ctrl+V)">📋 วาง</button>
        <button class="mini" id="btnDup" title="ทำซ้ำ (Ctrl+D)">ทำซ้ำ</button>
      </div>
      <div class="btnrow" style="margin-bottom:8px">
        <button class="mini" id="btnGroup" title="จัดกลุ่ม (Ctrl+G)">▣ Group</button>
        <button class="mini" id="btnUngroup" title="ยกเลิกกลุ่ม">▢ Ungroup</button>
        <button class="mini danger" id="btnDel" title="ลบ (Del)">🗑 ลบ</button>
      </div>
      <div class="layers" id="layersList"></div>
      <div class="empty" id="layersEmpty">ยังไม่มีวัตถุ</div>
    </div>
  </div>
`;

/* ---------- canvas init ---------- */
function initCanvas() {
  canvas = new fabric.Canvas("c", {
    backgroundColor: "transparent",
    preserveObjectStacking: true,
    selection: true,
    fireRightClick: false,
    stopContextMenu: true,
  });
  resize();
  buildTemplate();
  zoomFit();
  bindCanvasEvents();
}

function resize() {
  const r = stage.getBoundingClientRect();
  canvas.setWidth(r.width);
  canvas.setHeight(r.height);
  canvas.renderAll();
}
window.addEventListener("resize", () => { if (canvas) { resize(); } });

/* artboard + jersey template (locked background) */
let TPL_SIZE = "M";
let curStyle = 1;
let curLayout = "vertical"; // WORKING view is always vertical; "horizontal" is applied transiently only at export
// fabric types — border flag decides export orientation (no border → export horizontal facing)
// 3 fabric materials (code only) × trim on/off (separate). No-trim ⇒ export horizontal.
const FABRICS = [
  { code: "mesh", name: "mesh" },
  { code: "B1", name: "B1" },
  { code: "C1", name: "C1" },
];
let curFabric = "mesh";
// ขลิบ 4 ระดับ: "none" (ไม่มี → export แนวนอน) · "neck" (คอ) · "neckarm" (คอ+แขน) · "full" (คอ+แขน+ชาย)
let curTrim = "full";
// split a combined trim path into { neck, arms } — neck subpath is the one centred horizontally, arms are the outer two
function splitTrim(d) {
  if (typeof d !== "string") return { neck: "", arms: "" };
  const nums = s => (s.match(/-?\d+\.?\d*/g) || []).map(Number);
  const bboxWH = s => { const a = nums(s); let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; for (let i = 0; i + 1 < a.length; i += 2) { mnx = Math.min(mnx, a[i]); mxx = Math.max(mxx, a[i]); mny = Math.min(mny, a[i + 1]); mxy = Math.max(mxy, a[i + 1]); } return (mxx - mnx) + (mxy - mny); };
  const cx = s => { const a = nums(s); let sx = 0, n = 0; for (let i = 0; i + 1 < a.length; i += 2) { sx += a[i]; n++; } return n ? sx / n : 0; };
  const subs = d.split(/(?=[Mm])/).filter(s => s.trim() && bboxWH(s) > 2); // drop degenerate (zero-size) subpaths
  if (subs.length <= 1) return { neck: subs[0] || d, arms: "" };
  const arr = subs.map(s => ({ s, x: cx(s) }));
  const xs = arr.map(a => a.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  let neckIdx = 0, bd = Infinity; arr.forEach((a, i) => { const dd = Math.abs(a.x - mid); if (dd < bd) { bd = dd; neckIdx = i; } });
  return { neck: arr[neckIdx].s, arms: arr.filter((a, i) => i !== neckIdx).map(a => a.s).join(" ") };
}
let cutOn = true;   // laser cut line (offset outline) for vertical jobs
let cutMm = 7;      // cut margin in mm (seam allowance for laser)
// build a real outward-offset path of a silhouette (used as the laser cut line)
function offsetPathD(d, m) {
  try {
    const NS = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(NS, "path"); path.setAttribute("d", d);
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.style.position = "absolute"; svg.style.opacity = "0"; svg.appendChild(path); document.body.appendChild(svg);
    const L = path.getTotalLength(); if (!L) { document.body.removeChild(svg); return ""; }
    const N = Math.min(700, Math.max(160, Math.round(L)));
    const pts = []; for (let i = 0; i < N; i++) { const pt = path.getPointAtLength(i / N * L); pts.push({ x: pt.x, y: pt.y }); }
    document.body.removeChild(svg);
    const area = pp => { let a = 0; for (let i = 0; i < pp.length; i++) { const p = pp[i], q = pp[(i + 1) % pp.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };
    const build = s => { const o = []; for (let i = 0; i < N; i++) { const pr = pts[(i - 1 + N) % N], nx = pts[(i + 1) % N]; let tx = nx.x - pr.x, ty = nx.y - pr.y; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len; o.push({ x: pts[i].x + ty * s * m, y: pts[i].y - tx * s * m }); } return o; };
    const a0 = area(pts), p1 = build(1); const pf = area(p1) > a0 ? p1 : build(-1); // pick the sign that ENLARGES (outward)
    return "M" + pf.map(p => p.x.toFixed(2) + "," + p.y.toFixed(2)).join("L") + "Z";
  } catch (e) { return ""; }
}
// bounding box of a path (garment viewBox units) — used to place the size label at bottom-right
function pathBBox(d) {
  try {
    const NS = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(NS, "path"); path.setAttribute("d", d);
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.style.position = "absolute"; svg.style.opacity = "0"; svg.appendChild(path); document.body.appendChild(svg);
    const b = path.getBBox(); document.body.removeChild(svg);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch (e) { return null; }
}
function currentFabric() { return FABRICS.find(f => f.code === curFabric) || FABRICS[0]; }
function fabricWantsHorizontal() { return curTrim === "none"; }
let artboardRect = null;
let bgObjects = [];
let panels = [];
let panelGroups = [];
let overlayGroups = []; // trim + outline + size label — rendered ABOVE user objects so ขลิบ ไม่โดนลายบัง
let bodyColor = "#ffffff";
let trimColor = "#e6ecf5";
let bodyPattern = null;
let bodyPatternSrc = null;

function fitScale(w, h) { const s = Math.min((ART.w * 0.9) / w, (ART.h * 0.92) / h); return isFinite(s) && s > 0 ? s : 1; }
function garmentAspect() {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  return sz && sz.dims && sz.dims.front ? sz.dims.front[0] / sz.dims.front[1] : 0.83;
}
function layoutGroups() {
  return curStyle === 2
    ? [{ label: "นอก", items: [["outer-front", "หน้า", "front"], ["outer-back", "หลัง", "back"]] },
       { label: "ใน", items: [["inner-front", "หน้า", "front"], ["inner-back", "หลัง", "back"]] }]
    : [{ label: "", items: [["front", "หน้า", "front"], ["back", "หลัง", "back"]] }];
}
function computeLayout() {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const dF = sz && sz.dims && sz.dims.front ? sz.dims.front : [46, 55];
  const dB = sz && sz.dims && sz.dims.back ? sz.dims.back : dF;
  const horiz = curLayout === "horizontal";
  const gwCmRaw = Math.max(dF[0], dB[0]);          // garment width (cm)
  const ghCmRaw = Math.max(dF[1], dB[1]);          // garment height (cm)
  // after a 90° rotation the footprint swaps: cell width uses garment height and vice-versa
  const cellWcm = (horiz ? ghCmRaw : gwCmRaw) * 1.05;
  const cellHcm = (horiz ? gwCmRaw : ghCmRaw) * 1.03;
  const gW = cellWcm * PX_PER_CM, gH = cellHcm * PX_PER_CM;
  const gap = (horiz ? 3 : 8) * PX_PER_CM, labelH = 4 * PX_PER_CM, padY = 8 * PX_PER_CM;
  const groups = layoutGroups(), rows = groups.length, cols = 2;
  ART.w = SHEET_W_CM * PX_PER_CM;                   // fixed 155 cm sheet (exact)
  const contentW = cols * gW + (cols - 1) * gap;
  const marginX = Math.max((ART.w - contentW) / 2, 20);
  ART.h = Math.round(padY * 2 + rows * (gH + labelH) + (rows - 1) * gap);
  panels = [];
  groups.forEach((g, r) => g.items.forEach((it, c) => {
    const x = marginX + c * (gW + gap);
    const y = padY + r * (gH + labelH + gap) + labelH;
    // horizontal: rotate 90° so necklines (top of garment) face the centre gap.
    // left column (c=0) rotates +90 (neck → right/inward); right column (c=1) rotates −90 (neck → left/inward)
    const angle = horiz ? (c === 0 ? 90 : -90) : 0;
    panels.push({ id: it[0], side: it[1], tpl: it[2], group: g.label, w: gW, h: gH, x, y, cx: x + gW / 2, cy: y + gH / 2, angle });
  }));
}
const SVG_HEAD = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 470" width="400" height="470">`;
// BODY layer — the shirt fill/pattern (sits BELOW user objects; also used as the clip shape)
function garmentSVG(tpl) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const bodyD = sz ? (tpl === "front" ? sz.front : sz.back) : TPL[tpl];
  const cid = "clip" + Math.random().toString(36).slice(2);
  const base = `<path d="${bodyD}" fill="${bodyColor}"/>`;
  const pat = bodyPatternSrc ? `<g clip-path="url(#${cid})"><image href="${bodyPatternSrc}" xlink:href="${bodyPatternSrc}" x="0" y="0" width="400" height="470" preserveAspectRatio="xMidYMid slice"/></g>` : "";
  return `${SVG_HEAD}<defs><clipPath id="${cid}"><path d="${bodyD}"/></clipPath></defs>${base}${pat}</svg>`;
}
// OVERLAY layer — ขลิบ (trim/hem) + cut outline + size mark; rendered ABOVE user objects so ขลิบ ไม่โดนลายบัง
function garmentOverlaySVG(tpl) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const bodyD = sz ? (tpl === "front" ? sz.front : sz.back) : TPL[tpl];
  const trimD = sz ? (tpl === "front" ? sz.trimFront : sz.trimBack) : null;
  const hemD = sz ? (tpl === "front" ? sz.hemFront : sz.hemBack) : null;
  const cid = "clip" + Math.random().toString(36).slice(2);
  const hasNeck = curTrim !== "none";
  const hasArm = curTrim === "neckarm" || curTrim === "full";
  const hasHem = curTrim === "full";
  const parts = (hasNeck || hasArm) ? splitTrim(trimD) : { neck: "", arms: "" };
  const trimNeck = hasNeck && parts.neck ? `<path d="${parts.neck}" fill="${trimColor}"/>` : "";
  const trimArm = hasArm && parts.arms ? `<path d="${parts.arms}" fill="${trimColor}"/>` : "";
  const trimSVG = trimNeck + trimArm;
  const hemSVG = !hasHem ? "" : Array.isArray(hemD)
    ? `<rect x="${hemD[0]}" y="${hemD[1]}" width="${hemD[2]}" height="${hemD[3]}" fill="${trimColor}"/>`
    : (typeof hemD === "string" ? `<path d="${hemD}" fill="${trimColor}"/>` : "");
  const outline = `<path d="${bodyD}" fill="none" stroke="#4b5563" stroke-width="0.7"/>`;
  const cutD = (curTrim !== "none" && cutOn && cutMm > 0) ? offsetPathD(bodyD, cutMm / MM_PER_UNIT) : "";
  const cut = cutD ? `<path d="${cutD}" fill="none" stroke="#000000" stroke-width="0.4"/>` : "";
  const bb = pathBBox(bodyD);
  let sizeLbl = "";
  if (bb) {
    const tx = (bb.x + bb.w - 2).toFixed(1), ty = (bb.y + bb.h - 2.5).toFixed(1);
    const b2 = `x="${tx}" y="${ty}" font-family="Arial, sans-serif" font-size="6" font-weight="700" text-anchor="end"`;
    sizeLbl = `<text ${b2} fill="none" stroke="#000000" stroke-width="1.2" stroke-linejoin="round">${TPL_SIZE}</text><text ${b2} fill="#ffffff">${TPL_SIZE}</text>`;
  }
  return `${SVG_HEAD}<defs><clipPath id="${cid}"><path d="${bodyD}"/></clipPath></defs><g clip-path="url(#${cid})">${trimSVG}${hemSVG}</g>${outline}${cut}${sizeLbl}</svg>`;
}
function placeGarment(p) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const dims = sz && sz.dims ? (p.tpl === "front" ? sz.dims.front : sz.dims.back) : null;
  const idx = panels.indexOf(p);
  const setup = g => {
    const s = dims ? 1 : Math.min((p.w * 0.96) / g.width, (p.h * 0.98) / g.height); // native units already = real size
    if (isFinite(s) && s > 0) g.scale(s);
    g.set({ originX: "center", originY: "center", left: p.cx, top: p.cy });
    if (String(p.id).startsWith("inner")) g.flipX = true;
    if (p.angle) g.angle = p.angle;
    g.set({ selectable: false, evented: false, excludeFromExport: false, hoverCursor: "default" });
  };
  fabric.loadSVGFromString(garmentSVG(p.tpl), (objs, opts) => {
    if (!objs || !objs.length) return;
    const g = fabric.util.groupSVGElements(objs, opts); setup(g);
    g._bg = true; bgObjects.push(g); panelGroups[idx] = g; canvas.add(g); fixBackOrder(); canvas.requestRenderAll();
  });
  fabric.loadSVGFromString(garmentOverlaySVG(p.tpl), (objs, opts) => {
    if (!objs || !objs.length) return;
    const g = fabric.util.groupSVGElements(objs, opts); setup(g);
    g._bg = true; g._overlay = true; overlayGroups[idx] = g; canvas.add(g); fixBackOrder(); canvas.requestRenderAll();
  });
}
function fmtCm(n) { return (+Number(n).toFixed(4)).toString(); }
function addDim(p) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const dims = sz && sz.dims ? (p.tpl === "front" ? sz.dims.front : sz.dims.back) : [46, 55];
  const gw = dims[0] * PX_PER_CM, gh = dims[1] * PX_PER_CM;
  const gx = p.cx - gw / 2, gy = p.cy - gh / 2, col = "#9aa7bd";
  const mk = o => { o.set({ selectable: false, evented: false, hoverCursor: "default" }); o._bg = true; bgObjects.push(o); canvas.add(o); };
  const wy = gy + gh + 15;
  mk(new fabric.Line([gx, wy, gx + gw, wy], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Line([gx, wy - 5, gx, wy + 5], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Line([gx + gw, wy - 5, gx + gw, wy + 5], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Text(fmtCm(dims[0]) + " ซม.", { left: p.cx, top: wy + 5, fontSize: 15, fill: col, fontFamily: "Sora, 'Noto Sans Thai', sans-serif", originX: "center" }));
  const hx = gx - 15;
  mk(new fabric.Line([hx, gy, hx, gy + gh], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Line([hx - 5, gy, hx + 5, gy], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Line([hx - 5, gy + gh, hx + 5, gy + gh], { stroke: col, strokeWidth: 1 }));
  mk(new fabric.Text(fmtCm(dims[1]) + " ซม.", { left: hx - 7, top: p.cy, fontSize: 15, fill: col, fontFamily: "Sora, 'Noto Sans Thai', sans-serif", originX: "center", originY: "center", angle: -90 }));
}
function applyGarment() { buildTemplate(); }
function buildTemplate() {
  bgObjects.forEach(o => canvas.remove(o));
  overlayGroups.forEach(o => o && canvas.remove(o));
  if (artboardRect) canvas.remove(artboardRect);
  bgObjects = []; panelGroups = []; overlayGroups = [];
  computeLayout();
  artboardRect = new fabric.Rect({ left: 0, top: 0, width: ART.w, height: ART.h, fill: "#ffffff", selectable: false, evented: false, hoverCursor: "default", rx: 6, ry: 6 });
  artboardRect._bg = true; canvas.add(artboardRect);
  panels.forEach(p => { placeGarment(p); });
  fixBackOrder(); canvas.requestRenderAll();
  // pattern is an async <image> — re-render a few times so late-loading panels (esp. inner in style 2) show the pattern
  if (bodyPatternSrc) [200, 500, 900, 1400].forEach(t => setTimeout(() => { if (canvas) { fixBackOrder(); canvas.requestRenderAll(); } }, t));
  updateImportTarget();
  updateInfo();
}
function updateInfo() {
  const el = document.getElementById("infoBox"); if (!el) return;
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const fab = currentFabric();
  const trimLbl = { none: "ไม่มีขลิบ", neck: "ขลิบคอ", neckarm: "ขลิบคอ+แขน", full: "ขลิบคอ+แขน+ชาย" }[curTrim] || curTrim;
  let html = `<div class="irow"><span>กระดาษ</span><b>${SHEET_W_CM} ซม.</b></div><div class="irow"><span>ไซซ์</span><b>${TPL_SIZE}</b></div><div class="irow"><span>ผ้า</span><b>${fab.name}</b></div><div class="irow"><span>ขลิบ</span><b>${trimLbl}</b></div><div class="irow"><span>export</span><b>${fabricWantsHorizontal() ? "แนวนอน · หันเข้าหากัน" : "แนวตั้ง"}</b></div>`;
  panels.forEach(p => { const d = sz && sz.dims ? (p.tpl === "front" ? sz.dims.front : sz.dims.back) : null; if (d) html += `<div class="irow"><span>${(p.group ? p.group + " · " : "") + p.side}</span><b>${fmtCm(d[0])} × ${fmtCm(d[1])} ซม.</b></div>`; });
  el.innerHTML = html;
}
function rebuildLayout() { buildTemplate(); zoomFit(); }
function updateDim() {
  const el = document.getElementById("dimLbl"); if (!el) return;
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const d = sz && sz.dims && sz.dims.front;
  el.textContent = d ? (TPL_SIZE + " · " + fmtCm(d[0]) + "×" + fmtCm(d[1]) + " ซม.") : TPL_SIZE;
}

/* ---------- zoom / pan ---------- */
let zoom = 1;
function applyZoom(z, pointer) {
  z = Math.max(0.15, Math.min(5, z));
  if (pointer) canvas.zoomToPoint(pointer, z);
  else canvas.setZoom(z);
  zoom = z;
  $("#zoomLbl").textContent = Math.round(z * 100) + "%";
}
function zoomFit() {
  const pad = 60;
  const zx = (canvas.getWidth() - pad) / ART.w;
  const zy = (canvas.getHeight() - pad) / ART.h;
  const z = Math.min(zx, zy);
  applyZoom(z);
  const vpt = canvas.viewportTransform;
  vpt[4] = (canvas.getWidth() - ART.w * z) / 2;
  vpt[5] = (canvas.getHeight() - ART.h * z) / 2;
  canvas.setViewportTransform(vpt);
}
$("#zoomIn").onclick = () => applyZoom(zoom * 1.2, { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 });
$("#zoomOut").onclick = () => applyZoom(zoom / 1.2, { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 });
$("#zoomFit").onclick = zoomFit;

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), 1800);
}
function userObjects() { return canvas.getObjects().filter(o => !o._bg && !o._temp); }
function hint(msg) { $("#hint").textContent = msg || ""; }

/* ---------- history (undo/redo) ---------- */
function serialize() { return JSON.stringify(userObjects().map(o => o.toObject(["name", "rosterTag"]))); }
function pushHistory() {
  if (restoring) return;
  history = history.slice(0, hIndex + 1);
  history.push(serialize());
  if (history.length > 60) history.shift();
  hIndex = history.length - 1;
}
function restore(json) {
  restoring = true;
  userObjects().forEach(o => canvas.remove(o));
  let arr = []; try { arr = JSON.parse(json); } catch (e) {}
  fabric.util.enlivenObjects(arr, objs => { objs.forEach(o => canvas.add(o)); fixBackOrder(); restoring = false; canvas.requestRenderAll(); refreshLayers(); syncProps(); }, "fabric");
}
function undo() { if (hIndex > 0) { hIndex--; restore(history[hIndex]); } }
function redo() { if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); } }
$("#btnUndo").onclick = undo;
$("#btnRedo").onclick = redo;

/* ---------- tool switching ---------- */
const cursors = { select: "default", node: "default", pen: "crosshair", rect: "crosshair", ellipse: "crosshair", poly: "crosshair", line: "crosshair", text: "text", image: "copy", hand: "grab" };
function setTool(name) {
  if (name === "image") { importMode = null; $("#fileImg").click(); return; }
  curTool = name;
  document.querySelectorAll(".tool").forEach(b => b.classList.toggle("on", b.dataset.tool === name));
  const drawing = ["rect", "ellipse", "poly", "line", "pen", "text", "hand"].includes(name);
  canvas.selection = name === "select";
  userObjects().forEach(o => { o.selectable = name === "select" || name === "node"; o.evented = name === "select" || name === "node"; });
  canvas.defaultCursor = cursors[name] || "default";
  canvas.setCursor(cursors[name] || "default");
  if (name !== "node") clearNodeHandles();
  if (name !== "pen") cancelPen();
  if (name === "node") startNodeEdit();
  canvas.requestRenderAll();
  hint(HINTS[name] || "");
}
const HINTS = {
  select: "ลากเลือก/ย้าย · ดับเบิลคลิกข้อความเพื่อแก้ไข",
  node: "เลือกเส้น/รูปที่วาดด้วยปากกา แล้วลากจุด (◯) และแกน (▫) เพื่อดัด",
  pen: "คลิกวางจุด · คลิกค้างแล้วลาก = จุดโค้ง · คลิกจุดแรกเพื่อปิด · Enter จบ · Esc ยกเลิก",
  rect: "ลากเพื่อวาดสี่เหลี่ยม", ellipse: "ลากเพื่อวาดวงกลม/วงรี", poly: "ลากเพื่อวาดรูปหลายเหลี่ยม",
  line: "ลากเพื่อวาดเส้น", text: "คลิกเพื่อพิมพ์ข้อความ", hand: "ลากเพื่อเลื่อนมุมมอง (หรือกด Space ค้าง)",
};
document.querySelectorAll(".tool").forEach(b => b.onclick = () => setTool(b.dataset.tool));

/* ---------- drawing state ---------- */
let drawing = false, startPt = null, tempObj = null;
let isPanning = false, lastPan = null, spaceDown = false;

function curFill() { return fillState.fill; }
function curStroke() { return fillState.stroke; }
const fillState = { fill: "#2563eb", stroke: "#111827", strokeW: 0 };

function newShapeFromDrag(tool, a, b) {
  const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  const base = { left, top, fill: curFill(), stroke: fillState.strokeW ? curStroke() : "", strokeWidth: fillState.strokeW, strokeUniform: true, objectCaching: false };
  if (tool === "rect") return new fabric.Rect({ ...base, width: Math.max(w, 1), height: Math.max(h, 1), rx: 0, ry: 0 });
  if (tool === "ellipse") return new fabric.Ellipse({ ...base, rx: Math.max(w / 2, 1), ry: Math.max(h / 2, 1) });
  if (tool === "line") return new fabric.Line([a.x, a.y, b.x, b.y], { ...base, fill: "", stroke: curStroke(), strokeWidth: Math.max(fillState.strokeW || 4, 2) });
  if (tool === "poly") {
    const cx = left + w / 2, cy = top + h / 2, rx = Math.max(w / 2, 1), ry = Math.max(h / 2, 1), n = 6;
    const pts = [];
    for (let i = 0; i < n; i++) { const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; pts.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) }); }
    return new fabric.Polygon(pts, { ...base });
  }
}

/* ---------- canvas events ---------- */
function bindCanvasEvents() {
  canvas.on("mouse:down", opt => {
    const e = opt.e;
    if (curTool === "hand" || spaceDown || e.button === 1) {
      isPanning = true; lastPan = { x: e.clientX, y: e.clientY }; canvas.setCursor("grabbing"); return;
    }
    const p = canvas.getPointer(e);
    if (curTool === "pen") { penDown(p, opt); return; }
    if (curTool === "text") {
      const t = new fabric.IText("ข้อความ", { left: p.x, top: p.y, fill: curFill(), fontFamily: fontStack(curFont), fontSize: 40 });
      canvas.add(t); canvas.setActiveObject(t); t.enterEditing(); t.selectAll();
      setTool("select"); pushHistory(); refreshLayers(); return;
    }
    if (["rect", "ellipse", "poly", "line"].includes(curTool)) {
      drawing = true; startPt = p;
      tempObj = newShapeFromDrag(curTool, p, { x: p.x + 1, y: p.y + 1 });
      canvas.add(tempObj); return;
    }
  });

  canvas.on("mouse:move", opt => {
    const e = opt.e;
    if (isPanning && lastPan) {
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastPan.x; vpt[5] += e.clientY - lastPan.y;
      canvas.setViewportTransform(vpt); lastPan = { x: e.clientX, y: e.clientY }; return;
    }
    const p = canvas.getPointer(e);
    if (curTool === "pen") { penMove(p); return; }
    if (drawing && tempObj) {
      canvas.remove(tempObj);
      tempObj = newShapeFromDrag(curTool, startPt, p);
      canvas.add(tempObj); canvas.requestRenderAll();
    }
  });

  canvas.on("mouse:up", opt => {
    if (isPanning) { isPanning = false; lastPan = null; canvas.setCursor(curTool === "hand" ? "grab" : "default"); return; }
    if (drawing && tempObj) {
      drawing = false;
      const o = tempObj; tempObj = null;
      canvas.setActiveObject(o); setTool("select"); pushHistory(); refreshLayers(); syncProps();
    }
    clearGuides();
  });

  canvas.on("mouse:wheel", opt => {
    const e = opt.e; e.preventDefault(); e.stopPropagation();
    const delta = e.deltaY;
    let z = canvas.getZoom() * (delta > 0 ? 0.92 : 1.08);
    applyZoom(z, { x: e.offsetX, y: e.offsetY });
  });

  canvas.on("selection:created", onSelect);
  canvas.on("selection:updated", onSelect);
  canvas.on("selection:cleared", () => { syncProps(); refreshLayers(); });
  canvas.on("object:modified", opt => { pushHistory(); syncProps(); if (clipOn && opt && opt.target) applyClip(opt.target); if (curTool === "node") startNodeEdit(); });
  canvas.on("object:added", opt => { if (!restoring) refreshLayers(); if (clipOn && opt && opt.target) applyClip(opt.target); if (opt && opt.target && !opt.target._overlay) overlayGroups.filter(Boolean).forEach(o => o.bringToFront()); });
  canvas.on("object:removed", () => { if (!restoring) refreshLayers(); });
  canvas.on("text:changed", () => refreshLayers());
}
function onSelect() { syncProps(); refreshLayers(); if (curTool === "node") startNodeEdit(); }

/* ---------- image / svg import ---------- */
let importMode = null; // null = free image tool · "front"/"back" = place on that shirt panel + clip in-shape
$("#fileImg").addEventListener("change", ev => {
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  const isSvg = /svg/.test(file.type) || /\.svg$/i.test(file.name);
  reader.onload = () => {
    if (isSvg) fabric.loadSVGFromString(reader.result, (objs, opts) => placeArtwork(fabric.util.groupSVGElements(objs, opts)));
    else fabric.Image.fromURL(reader.result, img => placeArtwork(img));
  };
  if (isSvg) reader.readAsText(file); else reader.readAsDataURL(file);
  ev.target.value = "";
});
function panelLabel(p) { return (p.group ? p.group + " " : "") + p.side; }
// keep the "ลายเข้า:" dropdown in sync with the current panels (style 1 = หน้า/หลัง · style 2 = นอก/ใน × หน้า/หลัง)
function updateImportTarget() {
  const sel = document.getElementById("importTarget"); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = panels.map(p => `<option value="${p.id}">ลายเข้า: ${panelLabel(p)}</option>`).join("");
  if (panels.some(p => p.id === cur)) sel.value = cur;
}
function placeArtwork(obj) {
  const mode = importMode; importMode = null;
  const idx = mode ? panels.findIndex(p => p.id === mode) : -1;
  if (idx >= 0) {
    const p = panels[idx]; const { gw, gh } = garmentDims(p);
    obj.set({ left: p.cx, top: p.cy, originX: "center", originY: "center" }); fitInto(obj, Math.min(gw, gh) * 1.1);
  } else {
    obj.set({ left: ART.w / 2, top: ART.h / 2, originX: "center", originY: "center" }); fitInto(obj, 360);
  }
  obj.setCoords();
  canvas.add(obj); canvas.setActiveObject(obj);
  if (idx >= 0) { const src = panelGroups[idx]; if (src) src.clone(cl => { cl.absolutePositioned = true; obj.clipPath = cl; obj.dirty = true; canvas.requestRenderAll(); }); }
  pushHistory(); refreshLayers(); setTool("select");
  if (idx >= 0) toast("นำลายเข้า " + panelLabel(panels[idx]) + " แล้ว — ตัดในทรง ลากขยับได้");
}
function fitInto(obj, max) {
  const w = obj.width * (obj.scaleX || 1), h = obj.height * (obj.scaleY || 1);
  const s = Math.min(max / w, max / h, 1);
  obj.scale((obj.scaleX || 1) * s);
}

/* ---------- PEN / BÉZIER tool ---------- */
let penActive = false, penDragging = false, penPts = [], penTemp = [];
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function penD(pts, close) {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], c1 = a.hOut || a, c2 = b.hIn || b;
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
  }
  if (close) { const a = pts[pts.length - 1], b = pts[0], c1 = a.hOut || a, c2 = b.hIn || b; d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y} Z`; }
  return d;
}
function clearPenTemp() { penTemp.forEach(o => canvas.remove(o)); penTemp = []; }
function marker(x, y, anchor) {
  const o = anchor
    ? new fabric.Circle({ left: x, top: y, radius: 5, originX: "center", originY: "center", fill: "#fff", stroke: "#2563eb", strokeWidth: 2 })
    : new fabric.Rect({ left: x, top: y, width: 8, height: 8, originX: "center", originY: "center", fill: "#93c5fd", stroke: "#2563eb", strokeWidth: 1 });
  o.set({ selectable: false, evented: false, excludeFromExport: true }); o._temp = true; return o;
}
function renderPen(mouse) {
  clearPenTemp();
  let pts = penPts;
  if (mouse && !penDragging && penPts.length >= 1) pts = penPts.concat([{ x: mouse.x, y: mouse.y, hIn: null, hOut: null }]);
  const d = penD(pts, false);
  if (d) {
    const prev = new fabric.Path(d, { fill: "", stroke: "#2563eb", strokeWidth: 1.5, strokeDashArray: [5, 4], selectable: false, evented: false, excludeFromExport: true, strokeUniform: true });
    prev._temp = true; penTemp.push(prev); canvas.add(prev);
  }
  penPts.forEach(pt => {
    if (pt.hOut) { const h = marker(pt.hOut.x, pt.hOut.y, false); penTemp.push(h); canvas.add(h); }
    if (pt.hIn) { const h = marker(pt.hIn.x, pt.hIn.y, false); penTemp.push(h); canvas.add(h); }
  });
  penPts.forEach(pt => { const m = marker(pt.x, pt.y, true); penTemp.push(m); canvas.add(m); });
  canvas.requestRenderAll();
}
function penDown(p) {
  if (!penActive) { penActive = true; penPts = []; }
  if (penPts.length >= 2 && dist(p, penPts[0]) < 12 / canvas.getZoom()) { finishPen(true); return; }
  penPts.push({ x: p.x, y: p.y, hOut: null, hIn: null });
  penDragging = true; renderPen(p);
}
function penMove(p) {
  if (!penActive) return;
  if (penDragging) { const a = penPts[penPts.length - 1]; a.hOut = { x: p.x, y: p.y }; a.hIn = { x: 2 * a.x - p.x, y: 2 * a.y - p.y }; }
  renderPen(p);
}
function finishPen(close) {
  const pts = penPts.slice(); const wasActive = penActive;
  cancelPen();
  if (!wasActive || pts.length < 2) return;
  const closed = close;
  const path = new fabric.Path(penD(pts, closed), {
    fill: closed ? curFill() : "", stroke: curStroke() || "#111827",
    strokeWidth: fillState.strokeW || (closed ? 0 : 3), strokeUniform: true, objectCaching: false,
  });
  if (closed && !fillState.strokeW) path.stroke = "";
  canvas.add(path); canvas.setActiveObject(path); setTool("select"); pushHistory(); refreshLayers(); syncProps();
}
function cancelPen() { penActive = false; penDragging = false; penPts = []; clearPenTemp(); canvas.requestRenderAll(); }
canvas ? null : 0;

/* ---------- NODE (direct-select) editing ---------- */
let nodeHandles = [];
function clearNodeHandles() { nodeHandles.forEach(h => canvas.remove(h)); nodeHandles = []; }
function pathMatrix(path) { return path.calcOwnMatrix(); }
function pToCanvas(path, px, py) { const m = pathMatrix(path); const o = path.pathOffset; return fabric.util.transformPoint({ x: px - o.x, y: py - o.y }, m); }
function pToLocal(path, cx, cy) { const m = fabric.util.invertTransform(pathMatrix(path)); const o = path.pathOffset; const l = fabric.util.transformPoint({ x: cx, y: cy }, m); return { x: l.x + o.x, y: l.y + o.y }; }
function editablePoints(path) {
  const out = [];
  path.path.forEach((cmd, ci) => {
    const L = cmd[0];
    if (L === "M" || L === "L") out.push({ ci, idx: 1, anchor: true });
    else if (L === "Q") { out.push({ ci, idx: 1, anchor: false }); out.push({ ci, idx: 3, anchor: true }); }
    else if (L === "C") { out.push({ ci, idx: 1, anchor: false }); out.push({ ci, idx: 3, anchor: false }); out.push({ ci, idx: 5, anchor: true }); }
  });
  return out;
}
function startNodeEdit() {
  clearNodeHandles();
  const o = canvas.getActiveObject();
  if (!o || o.type !== "path") { hint(HINTS.node + "  — เลือกเส้นที่วาดด้วยปากกาก่อน"); return; }
  editablePoints(o).forEach(pt => {
    const c = pToCanvas(o, o.path[pt.ci][pt.idx], o.path[pt.ci][pt.idx + 1]);
    const h = pt.anchor
      ? new fabric.Circle({ radius: 6, fill: "#fff", stroke: "#2563eb", strokeWidth: 2 })
      : new fabric.Rect({ width: 9, height: 9, fill: "#93c5fd", stroke: "#2563eb", strokeWidth: 1 });
    h.set({ left: c.x, top: c.y, originX: "center", originY: "center", hasControls: false, hasBorders: false, excludeFromExport: true });
    h._temp = true; h._target = o; h._pt = pt;
    h.on("moving", () => { const loc = pToLocal(o, h.left, h.top); o.path[pt.ci][pt.idx] = loc.x; o.path[pt.ci][pt.idx + 1] = loc.y; o.dirty = true; o._setPositionDimensions ? o._setPositionDimensions({}) : null; canvas.requestRenderAll(); });
    h.on("mouseup", () => { clearNodeHandles(); pushHistory(); startNodeEdit(); });
    nodeHandles.push(h); canvas.add(h);
  });
  canvas.requestRenderAll();
}

/* ---------- snapping + guides ---------- */
let guides = [];
function clearGuides() { if (guides.length) { guides = []; canvas.requestRenderAll(); } }
function snapMove(opt) {
  const o = opt.target; if (!o || o._temp || o._bg) return;
  guides = [];
  const th = 6 / canvas.getZoom();
  const c = o.getCenterPoint();
  const targetsX = [ART.w / 2], targetsY = [ART.h / 2];
  userObjects().forEach(u => { if (u === o) return; const uc = u.getCenterPoint(); targetsX.push(uc.x); targetsY.push(uc.y); });
  for (const tx of targetsX) if (Math.abs(c.x - tx) < th) { o.setPositionByOrigin(new fabric.Point(tx, c.y), "center", "center"); guides.push({ x: tx, vert: true }); break; }
  const c2 = o.getCenterPoint();
  for (const ty of targetsY) if (Math.abs(c2.y - ty) < th) { o.setPositionByOrigin(new fabric.Point(c2.x, ty), "center", "center"); guides.push({ y: ty, vert: false }); break; }
}
canvas ? null : 0;
function bindExtra() {
  canvas.on("mouse:up", () => { if (curTool === "pen") penDragging = false; });
  canvas.on("object:moving", opt => snapMove(opt));
  canvas.on("mouse:dblclick", () => { if (curTool === "pen" && penActive) finishPen(false); });
  canvas.on("after:render", () => {
    if (!guides.length) return;
    const ctx = canvas.contextTop; const vpt = canvas.viewportTransform;
    ctx.save(); ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    ctx.strokeStyle = "#f43f5e"; ctx.lineWidth = 1 / canvas.getZoom(); ctx.setLineDash([4, 3]);
    guides.forEach(g => { ctx.beginPath(); if (g.vert) { ctx.moveTo(g.x, 0); ctx.lineTo(g.x, ART.h); } else { ctx.moveTo(0, g.y); ctx.lineTo(ART.w, g.y); } ctx.stroke(); });
    ctx.restore();
  });
}

/* ---------- fill/stroke target ---------- */
function setTarget(t) {
  fillTarget = t;
  $("#tgtFill").classList.toggle("on", t === "fill");
  $("#tgtStroke").classList.toggle("on", t === "stroke");
  $("#fillBtn").classList.toggle("on", t === "fill");
  $("#strokeBtn").classList.toggle("on", t === "stroke");
}
$("#tgtFill").onclick = () => setTarget("fill");
$("#tgtStroke").onclick = () => setTarget("stroke");
$("#fillBtn").onclick = () => setTarget("fill");
$("#strokeBtn").onclick = () => setTarget("stroke");
function garmentCode(id, c) { const i = PALINFO.find(p => p.c.toLowerCase() === String(c).toLowerCase()); const el = document.getElementById(id); if (el) el.textContent = i ? i.k : c; }
function setBodyColor(c) { bodyColor = c; bodyPattern = null; bodyPatternSrc = null; applyGarment(); garmentCode("bodyCode", c); }
function setTrimColor(c) { trimColor = c; applyGarment(); garmentCode("trimCode", c); }
function buildGarmentGrid(gridId, fn) {
  const g = document.getElementById(gridId); if (!g) return; g.innerHTML = "";
  PALETTE.forEach(hex => { const d = document.createElement("div"); d.className = "sw"; d.style.background = hex; d.title = hex; d.onclick = () => fn(hex); g.appendChild(d); });
}
const bodyPickEl = document.getElementById("bodyPick"); if (bodyPickEl) bodyPickEl.oninput = e => setBodyColor(e.target.value);
const trimPickEl = document.getElementById("trimPick"); if (trimPickEl) trimPickEl.oninput = e => setTrimColor(e.target.value);
const bodyWhiteEl = document.getElementById("bodyWhite"); if (bodyWhiteEl) bodyWhiteEl.onclick = () => setBodyColor("#ffffff");
$("#patUp").onclick = () => document.getElementById("filePat").click();
$("#patClr").onclick = () => { bodyPattern = null; bodyPatternSrc = null; lastPat = null; applyGarment(); toast("ล้างลายแล้ว"); };
document.getElementById("filePat").addEventListener("change", ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { bodyPatternSrc = r.result; applyGarment(); toast("ใส่ลายเต็มตัวแล้ว"); };
  r.readAsDataURL(f); ev.target.value = "";
});

/* ---------- apply color ---------- */
function showCode(color) { const info = PALINFO.find(p => p.c.toLowerCase() === String(color).toLowerCase()); $("#swCode").textContent = info ? info.k : (color === "none" ? "ไม่มีสี" : color); }
function applyColor(color) {
  const val = color === "none" ? "rgba(0,0,0,0)" : color;
  const objs = canvas.getActiveObjects();
  if (fillTarget === "fill") fillState.fill = val; else fillState.stroke = val;
  objs.forEach(o => {
    if (fillTarget === "fill") o.set("fill", val);
    else { o.set("stroke", val); if (!o.strokeWidth && color !== "none") o.set("strokeWidth", fillState.strokeW || 2); }
  });
  showCode(color); canvas.requestRenderAll(); syncProps();
  if (objs.length) pushHistory();
}
function buildSwatches() {
  const g = $("#swGrid");
  g.innerHTML = "";
  const none = document.createElement("div"); none.className = "sw none"; none.title = "ไม่มีสี";
  none.onclick = () => applyColor("none"); g.appendChild(none);
  PALETTE.forEach(hex => {
    const d = document.createElement("div"); d.className = "sw"; d.style.background = hex; d.title = hex;
    d.onclick = () => applyColor(hex); g.appendChild(d);
  });
}
$("#swNone").onclick = () => applyColor("none");
$("#swPick").oninput = e => applyColor(e.target.value);

/* ---------- stroke width / opacity / transform ---------- */
$("#swRange").oninput = e => { const v = +e.target.value; $("#swVal").textContent = v; fillState.strokeW = v; canvas.getActiveObjects().forEach(o => { o.set("strokeWidth", v); if (v && (!o.stroke || o.stroke === "rgba(0,0,0,0)")) o.set("stroke", fillState.stroke); }); canvas.requestRenderAll(); };
$("#swRange").onchange = () => canvas.getActiveObjects().length && pushHistory();
$("#opRange").oninput = e => { const v = +e.target.value; $("#opVal").textContent = v; canvas.getActiveObjects().forEach(o => o.set("opacity", v / 100)); canvas.requestRenderAll(); };
$("#opRange").onchange = () => canvas.getActiveObjects().length && pushHistory();
$("#tW").onchange = e => { const o = canvas.getActiveObject(); if (!o) return; const w = +e.target.value; if (w > 0) { o.scaleX = w / o.width; canvas.requestRenderAll(); pushHistory(); } };
$("#tH").onchange = e => { const o = canvas.getActiveObject(); if (!o) return; const h = +e.target.value; if (h > 0) { o.scaleY = h / o.height; canvas.requestRenderAll(); pushHistory(); } };
$("#tR").onchange = e => { const o = canvas.getActiveObject(); if (!o) return; o.rotate(+e.target.value || 0); canvas.requestRenderAll(); pushHistory(); };

function syncProps() {
  const o = canvas.getActiveObject();
  const fr = document.getElementById("fontRow"), fs = document.getElementById("fontSel");
  if (o && String(o.type).includes("text")) { if (fr) fr.style.display = ""; if (fs) { const m = /^"?([^",]+)/.exec(o.fontFamily || ""); fs.value = (m && FONTS.includes(m[1])) ? m[1] : curFont; } }
  else if (fr) fr.style.display = "none";
  if (!o) { $("#fillChip").style.background = "transparent"; $("#strokeChip").style.background = "transparent"; $("#swVal").textContent = "0"; $("#swRange").value = 0; $("#opRange").value = 100; $("#opVal").textContent = "100"; $("#tW").value = ""; $("#tH").value = ""; $("#tR").value = ""; return; }
  const first = o._objects ? o._objects[0] : o;
  $("#fillChip").style.background = first.fill || "transparent";
  $("#strokeChip").style.background = first.stroke || "transparent";
  $("#swRange").value = first.strokeWidth || 0; $("#swVal").textContent = first.strokeWidth || 0;
  $("#opRange").value = Math.round((o.opacity ?? 1) * 100); $("#opVal").textContent = Math.round((o.opacity ?? 1) * 100);
  $("#tW").value = Math.round(o.getScaledWidth()); $("#tH").value = Math.round(o.getScaledHeight()); $("#tR").value = Math.round(o.angle || 0);
}

/* ---------- align / arrange ---------- */
function fixBackOrder() { const bg = [artboardRect].concat(bgObjects).filter(Boolean); bg.slice().reverse().forEach(o => o.sendToBack()); overlayGroups.filter(Boolean).forEach(o => o.bringToFront()); }
document.querySelectorAll("[data-align]").forEach(b => b.onclick = () => {
  const o = canvas.getActiveObject(); if (!o) return;
  const w = o.getScaledWidth(), h = o.getScaledHeight();
  const a = b.dataset.align;
  if (a === "left") o.set({ left: 0 + (o.originX === "center" ? w / 2 : 0) });
  if (a === "right") o.set({ left: ART.w - (o.originX === "center" ? w / 2 : w) });
  if (a === "cx") o.set({ left: ART.w / 2 - (o.originX === "center" ? 0 : w / 2) });
  if (a === "top") o.set({ top: 0 + (o.originY === "center" ? h / 2 : 0) });
  if (a === "bottom") o.set({ top: ART.h - (o.originY === "center" ? h / 2 : h) });
  if (a === "cy") o.set({ top: ART.h / 2 - (o.originY === "center" ? 0 : h / 2) });
  o.setCoords(); canvas.requestRenderAll(); pushHistory();
});
document.querySelectorAll("[data-arrange]").forEach(b => b.onclick = () => {
  const o = canvas.getActiveObject(); if (!o) return;
  const a = b.dataset.arrange;
  if (a === "front") o.bringToFront(); if (a === "back") o.sendToBack();
  if (a === "forward") o.bringForward(); if (a === "backward") o.sendBackwards();
  fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); pushHistory();
});

/* ---------- group / dup / delete ---------- */
$("#btnGroup").onclick = () => { const s = canvas.getActiveObject(); if (s && s.type === "activeSelection") { s.toGroup(); canvas.requestRenderAll(); pushHistory(); refreshLayers(); } };
$("#btnUngroup").onclick = () => { const s = canvas.getActiveObject(); if (s && s.type === "group") { s.toActiveSelection(); canvas.requestRenderAll(); pushHistory(); refreshLayers(); } };
$("#btnDup").onclick = duplicate;
$("#btnDel").onclick = delSelected;
{ const bc = document.getElementById("btnCopy"); if (bc) bc.onclick = doCopy; const bp = document.getElementById("btnPaste"); if (bp) bp.onclick = doPaste; }
function duplicate() {
  const o = canvas.getActiveObject(); if (!o) return;
  o.clone(cl => { cl.set({ left: o.left + 22, top: o.top + 22 }); canvas.add(cl); canvas.setActiveObject(cl); pushHistory(); refreshLayers(); });
}
function delSelected() { canvas.getActiveObjects().forEach(o => canvas.remove(o)); canvas.discardActiveObject(); canvas.requestRenderAll(); pushHistory(); refreshLayers(); }

/* ---------- copy / paste ---------- */
let clipboard = null;
const CLONE_PROPS = ["name", "rosterTag"];
function doCopy() { const o = canvas.getActiveObject(); if (!o) return; o.clone(cl => { clipboard = cl; toast("คัดลอกแล้ว"); }, CLONE_PROPS); }
function doPaste() {
  if (!clipboard) return;
  clipboard.clone(cl => {
    canvas.discardActiveObject();
    cl.set({ left: (cl.left || 0) + 24, top: (cl.top || 0) + 24, evented: true });
    if (cl.type === "activeSelection") { cl.canvas = canvas; cl.forEachObject(o => canvas.add(o)); cl.setCoords(); }
    else canvas.add(cl);
    canvas.setActiveObject(cl); if (clipOn) applyClip(cl);
    canvas.requestRenderAll(); pushHistory(); refreshLayers();
  }, CLONE_PROPS);
}
// Ctrl+C / Ctrl+V / Ctrl+X arrive as native clipboard events (more reliable than keydown for these)
document.addEventListener("copy", e => { if (typing()) return; if (canvas.getActiveObject()) { e.preventDefault(); doCopy(); } });
document.addEventListener("cut", e => { if (typing()) return; if (canvas.getActiveObject()) { e.preventDefault(); doCopy(); delSelected(); } });
document.addEventListener("paste", e => { if (typing()) return; if (clipboard) { e.preventDefault(); doPaste(); } });

/* ---------- layers ---------- */
function objLabel(o) {
  const t = o.type;
  if (t === "rect") return "▭ สี่เหลี่ยม";
  if (t === "ellipse" || t === "circle") return "◯ วงรี";
  if (t === "polygon") return "⬠ หลายเหลี่ยม";
  if (t === "line") return "╱ เส้น";
  if (t === "path") return "✎ เส้นวาด";
  if (t === "group") return "▣ กลุ่ม";
  if (t === "image") return "🖼 รูปภาพ";
  if (t.includes("text")) return "T " + (o.text || "ข้อความ").slice(0, 14);
  return t;
}
function refreshLayers() {
  const list = $("#layersList"); const objs = userObjects().slice().reverse();
  $("#layersEmpty").style.display = objs.length ? "none" : "block";
  list.innerHTML = "";
  const active = canvas.getActiveObjects();
  objs.forEach(o => {
    const row = document.createElement("div"); row.className = "layer" + (active.includes(o) ? " sel" : "");
    row.innerHTML = `<button class="lbtn" data-a="vis">${o.visible === false ? "🚫" : "👁"}</button><button class="lbtn" data-a="lock">${o.lockMovementX ? "🔒" : "🔓"}</button><span class="lname">${objLabel(o)}</span><button class="lbtn" data-a="up">↑</button><button class="lbtn" data-a="down">↓</button>`;
    row.querySelector(".lname").onclick = () => { canvas.setActiveObject(o); canvas.requestRenderAll(); refreshLayers(); syncProps(); };
    row.querySelector('[data-a="vis"]').onclick = () => { o.visible = o.visible === false ? true : false; canvas.requestRenderAll(); refreshLayers(); };
    row.querySelector('[data-a="lock"]').onclick = () => { const l = !o.lockMovementX; o.set({ lockMovementX: l, lockMovementY: l, lockScalingX: l, lockScalingY: l, lockRotation: l }); refreshLayers(); };
    row.querySelector('[data-a="up"]').onclick = () => { o.bringForward(); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); pushHistory(); };
    row.querySelector('[data-a="down"]').onclick = () => { o.sendBackwards(); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); pushHistory(); };
    list.appendChild(row);
  });
}

/* ---------- style / size ---------- */
const styleSel = document.getElementById("styleSel");
const sizeSel = document.getElementById("sizeSel");
const fabricSel = document.getElementById("fabricSel");
const trimSel = document.getElementById("trimSel");
if (styleSel) styleSel.onchange = () => { curStyle = +styleSel.value; rebuildLayout(); if (clipOn) setTimeout(reclipAll, 200); };
if (sizeSel) sizeSel.onchange = () => { TPL_SIZE = sizeSel.value; rebuildLayout(); updateDim(); if (clipOn) setTimeout(reclipAll, 200); };
if (fabricSel) fabricSel.onchange = () => { curFabric = fabricSel.value; updateInfo(); };
if (trimSel) trimSel.onchange = () => { curTrim = trimSel.value; curLayout = "vertical"; rebuildLayout(); updateInfo(); if (clipOn) setTimeout(reclipAll, 200); };

/* ---------- new / save / open ---------- */
$("#btnNew").onclick = () => {
  if (!confirm("เริ่มดีไซน์ใหม่? งานที่ยังไม่เซฟจะหาย")) return;
  userObjects().forEach(o => canvas.remove(o));
  canvas.discardActiveObject(); canvas.requestRenderAll(); refreshLayers(); pushHistory();
};
function download(name, url) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
let isLoggedIn = false;
function getDoc() { return { app: "axiom-designer", version: 4, art: ART, style: curStyle, size: TPL_SIZE, fabric: curFabric, trim: curTrim, cutOn, cutMm, bodyColor, trimColor, bodyPatternSrc, objects: userObjects().map(o => o.toObject(["name", "rosterTag"])) }; }
function inFrame() { return window.parent && window.parent !== window; }
function localSave() { const blob = new Blob([JSON.stringify(getDoc())], { type: "application/json" }); download("axiom-design.axiom", URL.createObjectURL(blob)); toast("ดาวน์โหลดไฟล์แล้ว"); }
$("#btnSave").onclick = () => {
  if (inFrame() && isLoggedIn) {
    window.parent.postMessage({ type: "axiom-save", payload: { name: "ดีไซน์ " + new Date().toLocaleDateString("th-TH"), doc: getDoc(), preview: exportPNG(0.5), style: curStyle } }, "*");
    toast("กำลังบันทึกเข้าบัญชี...");
  } else if (inFrame()) {
    toast("ยังไม่เข้าสู่ระบบ — ดาวน์โหลดไฟล์แทน"); localSave();
  } else { localSave(); }
};
function openDoc(doc) {
  if (doc && doc.app === "axiom-roster") {
    openDoc(doc.template || {});
    const rt = document.getElementById("rosterText");
    if (rt) rt.value = (doc.roster || []).map(r => [r.name, r.number, r.size].filter(v => v !== undefined && v !== "").join("\t")).join("\n");
    const on = document.getElementById("orderName");
    if (on) on.value = doc.name || "";
    updateRosterCount(); updateTagInfo();
    toast("เปิดออเดอร์ทีมแล้ว");
    return;
  }
  try {
    userObjects().forEach(o => canvas.remove(o));
    if (doc.style) { curStyle = doc.style; const ss = document.getElementById("styleSel"); if (ss) ss.value = String(curStyle); }
    if (doc.size) { TPL_SIZE = doc.size; const zz = document.getElementById("sizeSel"); if (zz) zz.value = TPL_SIZE; }
    if (doc.fabric) { curFabric = doc.fabric; const ff = document.getElementById("fabricSel"); if (ff) ff.value = curFabric; }
    if (doc.trim !== undefined) { curTrim = typeof doc.trim === "boolean" ? (doc.trim ? "full" : "none") : doc.trim; const tf = document.getElementById("trimSel"); if (tf) tf.value = curTrim; }
    if (doc.cutOn !== undefined) { cutOn = !!doc.cutOn; const co = document.getElementById("cutOn"); if (co) co.checked = cutOn; }
    if (doc.cutMm !== undefined) { cutMm = +doc.cutMm; const cm = document.getElementById("cutMm"), cmv = document.getElementById("cutMmV"); if (cm) cm.value = cutMm; if (cmv) cmv.textContent = cutMm + " มม."; }
    curLayout = "vertical";
    if (doc.bodyColor) bodyColor = doc.bodyColor;
    if (doc.trimColor) trimColor = doc.trimColor;
    bodyPattern = null; bodyPatternSrc = doc.bodyPatternSrc || null;
    buildTemplate();
    fabric.util.enlivenObjects(doc.objects || [], objs => { objs.forEach(o => canvas.add(o)); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); }, "fabric");
    zoomFit(); updateDim(); toast("เปิดดีไซน์แล้ว");
  } catch (e) { toast("เปิดดีไซน์ไม่สำเร็จ"); }
}
window.addEventListener("message", ev => {
  const m = ev.data || {};
  if (m.type === "axiom-auth") isLoggedIn = !!m.user;
  else if (m.type === "axiom-save-result") toast(m.ok ? "บันทึกเข้าบัญชีแล้ว ✓" : ("บันทึกไม่สำเร็จ: " + (m.error || "")));
  else if (m.type === "axiom-quote-result") toast(m.ok ? "ส่งคำขอราคาแล้ว ✓ ทีมงานจะติดต่อกลับ" : ("ส่งไม่สำเร็จ: " + (m.error || "")));
  else if (m.type === "axiom-publish-result") { const pm = document.getElementById("pubMsg"); if (m.ok) { if (pm) pm.textContent = "เผยแพร่ขายแล้ว ✓"; toast("เผยแพร่ขายในตลาดแล้ว ✓"); setTimeout(() => { const md = document.getElementById("pubModal"); if (md) md.classList.remove("on"); }, 900); } else { if (pm) pm.textContent = "ไม่สำเร็จ: " + (m.error || ""); toast("เผยแพร่ไม่สำเร็จ"); } }
  else if (m.type === "axiom-save-order-result") { const p = document.getElementById("rosterProg"); if (p) p.textContent = m.ok ? "บันทึกออเดอร์เข้าบัญชีแล้ว ✓" : ("บันทึกไม่สำเร็จ: " + (m.error || "")); toast(m.ok ? "บันทึกออเดอร์แล้ว ✓" : "บันทึกไม่สำเร็จ"); }
  else if (m.type === "axiom-open" && m.doc) openDoc(m.doc);
});
$("#btnOpen").onclick = () => $("#fileOpen").click();
{ const bi = document.getElementById("btnImport"); if (bi) bi.onclick = () => { importMode = (document.getElementById("importTarget") || {}).value || "front"; const f = document.getElementById("fileImg"); if (f) f.click(); }; }
$("#fileOpen").addEventListener("change", ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { openDoc(JSON.parse(r.result)); }
    catch (e) { toast("ไฟล์ไม่ถูกต้อง"); }
  };
  r.readAsText(f); ev.target.value = "";
});

/* ---------- export ---------- */
// garments load asynchronously (loadSVGFromString); wait until all panels are present
function garmentsReady() { return panelGroups.filter(Boolean).length >= panels.length && overlayGroups.filter(Boolean).length >= panels.length; }
function waitGarments(timeout) {
  return new Promise(res => { const t0 = Date.now(); (function chk() { if (garmentsReady() || Date.now() - t0 > (timeout || 1800)) return res(); requestAnimationFrame(chk); })(); });
}
// For no-border mesh fabrics, the print sheet is laid out HORIZONTAL (each half rotated 90°, facing centre).
// Working canvas stays vertical; this transforms garments + user objects to horizontal only for the duration of an export, then restores.
async function enterExportLayout() {
  if (!fabricWantsHorizontal() || curLayout === "horizontal") return null;
  const vpanels = panels.map(p => ({ cx: p.cx, cy: p.cy }));
  const info = userObjects().map(o => {
    const idx = panelOf(o); const c = o.getCenterPoint();
    return { o, idx, dx: c.x - vpanels[idx].cx, dy: c.y - vpanels[idx].cy, left: o.left, top: o.top, originX: o.originX, originY: o.originY, angle: o.angle || 0 };
  });
  const wasClip = clipOn; clipOn = false; // avoid stale clip paths during transform
  curLayout = "horizontal"; buildTemplate(); await waitGarments();
  info.forEach(k => {
    const p = panels[k.idx]; if (!p) return;
    const th = (p.angle || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    const nx = p.cx + k.dx * cos - k.dy * sin, ny = p.cy + k.dx * sin + k.dy * cos;
    k.o.set({ originX: "center", originY: "center", left: nx, top: ny, angle: k.angle + (p.angle || 0) }); k.o.setCoords();
  });
  canvas.requestRenderAll();
  return async function restore() {
    info.forEach(k => { k.o.set({ originX: k.originX, originY: k.originY, left: k.left, top: k.top, angle: k.angle }); k.o.setCoords(); });
    curLayout = "vertical"; buildTemplate(); await waitGarments();
    clipOn = wasClip; if (clipOn) reclipAll();
    canvas.requestRenderAll();
  };
}
async function runExport(fn) { const r = await enterExportLayout(); try { return await fn(); } finally { if (r) await r(); } }
function exportPNG(mult) {
  const vpt = canvas.viewportTransform.slice();
  canvas.discardActiveObject(); clearNodeHandles(); clearPenTemp(); guides = [];
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  const data = canvas.toDataURL({ format: "png", left: 0, top: 0, width: ART.w, height: ART.h, multiplier: mult || 2 });
  canvas.setViewportTransform(vpt); canvas.requestRenderAll();
  return data;
}
$("#btnPng").onclick = () => runExport(() => { download("axiom-design.png", exportPNG(2)); toast("ดาวน์โหลด PNG แล้ว"); });
function buildSVGString() {
  clearNodeHandles(); clearPenTemp(); guides = [];
  let svg = canvas.toSVG({ viewBox: { x: 0, y: 0, width: ART.w, height: ART.h }, width: ART.w, height: ART.h });
  const Wmm = (ART.w * MM_PER_UNIT).toFixed(2), Hmm = (ART.h * MM_PER_UNIT).toFixed(2);
  svg = svg.replace(/<svg([^>]*)>/, (m2, a) => {
    a = a.replace(/\s(?:width|height|viewBox)="[^"]*"/g, "");
    return `<svg${a} width="${Wmm}mm" height="${Hmm}mm" viewBox="0 0 ${ART.w} ${ART.h}">`;
  });
  return svg;
}
$("#btnSvg").onclick = () => runExport(() => {
  download("axiom-design.svg", URL.createObjectURL(new Blob([buildSVGString()], { type: "image/svg+xml" })));
  toast("ดาวน์โหลด SVG (เวกเตอร์) แล้ว");
});

/* ---------- quote modal ---------- */
$("#btnQuote").onclick = () => $("#quoteModal").classList.add("on");
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $("#quoteModal").classList.remove("on"));
$("#qSend").onclick = () => {
  const payload = { name: $("#qName").value.trim() || "ลูกค้า", phone: $("#qPhone").value.trim(), email: $("#qEmail").value.trim(), message: $("#qNote").value.trim() };
  if (inFrame()) { window.parent.postMessage({ type: "axiom-quote", payload }, "*"); toast("กำลังส่งคำขอ..."); }
  else toast("ส่งคำขอ (เดโม)");
  $("#quoteModal").classList.remove("on");
};

/* ---------- publish to marketplace ---------- */
{
  const pb = document.getElementById("btnPublish");
  if (pb) pb.onclick = () => {
    if (!inFrame() || !isLoggedIn) { toast("ต้องเข้าสู่ระบบก่อนขายในตลาด"); return; }
    const nm = document.getElementById("pubName"); if (nm && !nm.value) nm.value = "เทมเพลต " + new Date().toLocaleDateString("th-TH");
    const pm = document.getElementById("pubMsg"); if (pm) pm.textContent = "";
    const ag = document.getElementById("pubAgree"); if (ag) ag.checked = false;
    document.getElementById("pubModal").classList.add("on");
  };
  document.querySelectorAll("[data-pubclose]").forEach(b => b.onclick = () => document.getElementById("pubModal").classList.remove("on"));
  const send = document.getElementById("pubSend");
  if (send) send.onclick = () => {
    const name = (document.getElementById("pubName").value || "").trim();
    const price = Math.max(0, parseInt(document.getElementById("pubPrice").value, 10) || 0);
    const category = (document.getElementById("pubCat").value || "").trim();
    const description = (document.getElementById("pubDesc").value || "").trim();
    const pm = document.getElementById("pubMsg");
    if (!name) { if (pm) pm.textContent = "กรุณาตั้งชื่อเทมเพลต"; return; }
    const agree = document.getElementById("pubAgree");
    if (!agree || !agree.checked) { if (pm) pm.textContent = "กรุณายอมรับข้อตกลงเรื่องลิขสิทธิ์ก่อนเผยแพร่"; return; }
    if (inFrame()) {
      window.parent.postMessage({ type: "axiom-publish", payload: { name, price, category, description, doc: getDoc(), preview: exportPNG(0.5) } }, "*");
      if (pm) pm.textContent = "กำลังเผยแพร่...";
    }
  };
}

/* ---------- keyboard ---------- */
function typing() { const a = document.activeElement; if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return true; const o = canvas.getActiveObject(); return o && o.isEditing; }
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !typing()) { spaceDown = true; canvas.setCursor("grab"); }
  if (typing()) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && k === "y") { e.preventDefault(); redo(); return; }
  if (ctrl && k === "g") { e.preventDefault(); e.shiftKey ? $("#btnUngroup").onclick() : $("#btnGroup").onclick(); return; }
  if (ctrl && k === "d") { e.preventDefault(); duplicate(); return; }
  if (ctrl && (k === "c" || k === "v" || k === "x")) return; // handled by clipboard events below
  if (ctrl && k === "0") { e.preventDefault(); zoomFit(); return; }
  if (ctrl) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSelected(); return; }
  if (e.key === "Escape") { if (penActive) cancelPen(); else { canvas.discardActiveObject(); canvas.requestRenderAll(); } setTool("select"); return; }
  if (e.key.indexOf("Arrow") === 0) {
    const objs = canvas.getActiveObjects();
    if (objs.length) {
      e.preventDefault();
      const s = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0;
      const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0;
      objs.forEach(o => { o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords(); if (clipOn) applyClip(o); });
      canvas.requestRenderAll(); nudgeHist();
    }
    return;
  }
  if (k === "c" && !e.shiftKey) { placeOnGarment(0, 0, true); return; } // C = center on shirt
  const map = { v: "select", a: "node", p: "pen", m: "rect", l: "ellipse", y: "poly", "\\": "line", t: "text", h: "hand" };
  if (map[k]) setTool(map[k]);
}, true);
window.addEventListener("keyup", e => { if (e.code === "Space") { spaceDown = false; canvas.setCursor(cursors[curTool] || "default"); } });
// iframe focus: keyboard shortcuts only fire when the designer window has focus — grab it on any interaction
window.addEventListener("mousedown", () => { try { window.focus(); } catch (e) {} }, true);
window.addEventListener("pointerdown", () => { try { window.focus(); } catch (e) {} }, true);
try { window.focus(); } catch (e) {}

/* ---------- boot ---------- */
/* ---------- ready-made procedural patterns ---------- */
let patScale = 1, patUseBrand = false, lastPat = null;
function _hx(v){ return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }
function _d(hex, f){ const n = parseInt(hex.slice(1), 16); return "#" + _hx(((n>>16)&255)*(1-f)) + _hx(((n>>8)&255)*(1-f)) + _hx((n&255)*(1-f)); }
function _l(hex, f){ const n = parseInt(hex.slice(1), 16); const r=(n>>16)&255, g=(n>>8)&255, b=n&255; return "#" + _hx(r+(255-r)*f) + _hx(g+(255-g)*f) + _hx(b+(255-b)*f); }
function brandCols(){ const b = (bodyColor && bodyColor[0] === "#") ? bodyColor : "#2563eb"; const acc = (trimColor && trimColor.toLowerCase() !== "#e6ecf5" && trimColor[0] === "#") ? trimColor : _l(b, 0.35); return [_d(b, 0.5), _d(b, 0.22), b, acc]; }
function camo(ctx, W, H, cols, sc){ ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, W, H); const blobs = cols.slice(1), n = Math.max(8, Math.round(W * H / 2600 / (sc * sc))); for (let i = 0; i < n; i++){ ctx.fillStyle = blobs[i % blobs.length]; const x = Math.random()*W, y = Math.random()*H, r = (6 + Math.random()*Math.min(W,H)*0.13)*sc, pts = 7 + Math.floor(Math.random()*4); ctx.beginPath(); for (let k=0;k<=pts;k++){ const a=k/pts*Math.PI*2, rr=r*(0.55+Math.random()*0.7), px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr; k?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); ctx.fill(); } }
function digicamo(ctx, W, H, cols, sc){ ctx.fillStyle = cols[0]; ctx.fillRect(0,0,W,H); const s = Math.max(6, Math.round(W/30))*sc, n = Math.round(W*H/(s*s)/2.2); for (let i=0;i<n;i++){ ctx.fillStyle = cols[1+Math.floor(Math.random()*(cols.length-1))]; const bw=(1+Math.floor(Math.random()*3))*s, bh=(1+Math.floor(Math.random()*3))*s, x=Math.floor(Math.random()*W/s)*s, y=Math.floor(Math.random()*H/s)*s; ctx.fillRect(x,y,bw,bh); } }
function stripes(ctx, W, H, cols, sc, angle){ ctx.save(); ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); ctx.translate(W/2,H/2); ctx.rotate(angle*Math.PI/180); const band=28*sc, R=Math.hypot(W,H); let i=0; for (let x=-R;x<R;x+=band){ ctx.fillStyle=cols[i%cols.length]; ctx.fillRect(x,-R,band,2*R); i++; } ctx.restore(); }
function dots(ctx, W, H, cols, sc){ const bg=cols[0], fg=cols[cols.length-1], r=11*sc, gap=36*sc; ctx.fillStyle=bg; ctx.fillRect(0,0,W,H); ctx.fillStyle=fg; for (let y=0;y<H+gap;y+=gap){ const off=((y/gap)%2)*gap/2; for (let x=0;x<W+gap;x+=gap){ ctx.beginPath(); ctx.arc(x+off,y,r,0,7); ctx.fill(); } } }
function gridlines(ctx, W, H, cols, sc){ const gap=22*sc; ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); ctx.strokeStyle=cols[cols.length-1]; ctx.lineWidth=2; for (let x=0;x<=W;x+=gap){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } for (let y=0;y<=H;y+=gap){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } }
function triangles(ctx, W, H, cols, sc){ const sz=42*sc; ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); const c=cols.slice(1).length?cols.slice(1):[cols[0]]; let idx=0; for (let y=0;y<H;y+=sz) for (let x=0;x<W;x+=sz){ ctx.fillStyle=c[idx%c.length]; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+sz,y); ctx.lineTo(x,y+sz); ctx.closePath(); ctx.fill(); ctx.fillStyle=c[(idx+1)%c.length]; ctx.beginPath(); ctx.moveTo(x+sz,y); ctx.lineTo(x+sz,y+sz); ctx.lineTo(x,y+sz); ctx.closePath(); ctx.fill(); idx++; } }
function hexagons(ctx, W, H, cols, sc){ const r=24*sc; ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); ctx.strokeStyle=cols[cols.length-1]; ctx.lineWidth=Math.max(2,r*0.14); const hw=Math.sqrt(3)*r, vh=1.5*r; for (let row=0,y=0;y<H+r;y+=vh,row++){ const xo=(row%2)*hw/2; for (let x=0;x<W+hw;x+=hw){ ctx.beginPath(); for (let i=0;i<6;i++){ const a=Math.PI/180*(60*i-90), px=x+xo+r*Math.cos(a), py=y+r*Math.sin(a); i?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); ctx.stroke(); } } }
function scales(ctx, W, H, cols, sc){ const r=26*sc; ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); ctx.strokeStyle=cols[cols.length-1]; ctx.lineWidth=Math.max(1.5,2*sc); for (let row=0,y=0;y<H+r;y+=r,row++){ const off=(row%2)*r; for (let x=-r;x<W+r;x+=2*r){ ctx.beginPath(); ctx.arc(x+off,y,r,0,Math.PI); ctx.stroke(); } } }
function star(ctx,cx,cy,ro,ri,pts){ ctx.beginPath(); for (let i=0;i<pts*2;i++){ const a=Math.PI/pts*i-Math.PI/2, rr=i%2?ri:ro, px=cx+Math.cos(a)*rr, py=cy+Math.sin(a)*rr; i?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); }
function starsPat(ctx, W, H, cols, sc){ ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); ctx.fillStyle=cols[cols.length-1]; const gap=70*sc, r=22*sc; for (let row=0,y=0;y<H+gap;y+=gap,row++){ const off=(row%2)*gap/2; for (let x=0;x<W+gap;x+=gap){ star(ctx,x+off,y,r,r*0.45,5); ctx.fill(); } } }
function flames(ctx, W, H, cols, sc){ const g=ctx.createLinearGradient(0,H,0,0); g.addColorStop(0,cols[0]); g.addColorStop(0.5,cols[Math.min(1,cols.length-1)]); g.addColorStop(1,cols[cols.length-1]); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); ctx.globalAlpha=0.5; const n=Math.round(W/(60*sc))*3; for (let i=0;i<n;i++){ ctx.fillStyle=cols[cols.length-1]; const x=Math.random()*W, by=H, h=(60+Math.random()*160)*sc, w=(20+Math.random()*40)*sc; ctx.beginPath(); ctx.moveTo(x,by); ctx.quadraticCurveTo(x-w/2,by-h*0.6,x,by-h); ctx.quadraticCurveTo(x+w/2,by-h*0.6,x,by); ctx.fill(); } ctx.globalAlpha=1; }
function graffiti(ctx, W, H, cols, sc){ ctx.fillStyle=cols[0]; ctx.fillRect(0,0,W,H); const c=cols.slice(1).length?cols.slice(1):[cols[cols.length-1]]; ctx.lineCap="round"; for (let i=0;i<22;i++){ ctx.strokeStyle=c[i%c.length]; ctx.lineWidth=(6+Math.random()*16)*sc; const x=Math.random()*W, y=Math.random()*H; ctx.beginPath(); ctx.moveTo(x,y); ctx.bezierCurveTo(x+(-60+Math.random()*120)*sc,y+(-60+Math.random()*120)*sc,x+(-60+Math.random()*120)*sc,y+(-60+Math.random()*120)*sc,x+(-80+Math.random()*160)*sc,y+(-80+Math.random()*160)*sc); ctx.stroke(); } for (let i=0;i<120;i++){ ctx.fillStyle=c[i%c.length]; ctx.beginPath(); ctx.arc(Math.random()*W,Math.random()*H,(1+Math.random()*5)*sc,0,7); ctx.fill(); } }
function grad(ctx, W, H, cols, type){ let g; if (type==="radial") g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.hypot(W,H)/2); else g=ctx.createLinearGradient(0,0,type==="diag"?W:0,H); cols.forEach((c,i)=>g.addColorStop(i/(cols.length-1),c)); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
const PATTERNS = [
  { n: "คาโม่เขียว", cols: ["#2f4a22","#6b8e3f","#213617","#9bbb63"], g: camo },
  { n: "คาโม่ทราย", cols: ["#8a6f3a","#b89b63","#5f4a24","#d9c48f"], g: camo },
  { n: "คาโม่เทา", cols: ["#565b62","#8a9096","#363b41","#b8bdc4"], g: camo },
  { n: "คาโม่ดิจิทัล", cols: ["#20303f","#3f5f7a","#132029","#6f97b5"], g: digicamo },
  { n: "สามเหลี่ยม", cols: ["#0b1020","#2563eb","#3b82f6"], g: triangles },
  { n: "รังผึ้ง", cols: ["#0b1020","#2563eb"], g: hexagons },
  { n: "เกล็ดปลา", cols: ["#0e2233","#4aa3c7"], g: scales },
  { n: "ดาว", cols: ["#0b1020","#f5c542"], g: starsPat },
  { n: "เปลวไฟ", cols: ["#1a0500","#ff6a00","#ffd400"], g: flames },
  { n: "กราฟฟิตี", cols: ["#111827","#ec4899","#22d3ee","#a3e635"], g: graffiti },
  { n: "เส้นทแยง", cols: ["#1f3a8a","#ffffff"], g: (c,W,H,cl,sc)=>stripes(c,W,H,cl,sc,45) },
  { n: "เส้นตั้ง", cols: ["#c1272d","#ffffff"], g: (c,W,H,cl,sc)=>stripes(c,W,H,cl,sc,0) },
  { n: "จุดพลาสติก", cols: ["#111827","#f5c542"], g: dots },
  { n: "เส้นตาราง", cols: ["#0f172a","#334155"], g: gridlines },
  { n: "ไล่สีน้ำเงิน", cols: ["#1e3a8a","#3b82f6","#93c5fd"], g: (c,W,H,cl)=>grad(c,W,H,cl,"vert") },
  { n: "ไล่สีพระอาทิตย์", cols: ["#f97316","#db2777","#7c3aed"], g: (c,W,H,cl)=>grad(c,W,H,cl,"diag") },
  { n: "เรเดียล", cols: ["#22d3ee","#0e7490"], g: (c,W,H,cl)=>grad(c,W,H,cl,"radial") },
];
function renderCurrentPattern(){ if (!lastPat) return; const cols = patUseBrand ? brandCols() : lastPat.cols; const c = document.createElement("canvas"); c.width = 560; c.height = 660; lastPat.g(c.getContext("2d"), 560, 660, cols, patScale); bodyPatternSrc = c.toDataURL("image/png"); bodyPattern = null; applyGarment(); }
function applyPattern(pat){ lastPat = pat; renderCurrentPattern(); toast("ใส่ลาย " + pat.n); }
function buildPatternGallery(){ const gr = document.getElementById("patGrid"); if (!gr) return; gr.innerHTML = ""; PATTERNS.forEach(pat => { const c = document.createElement("canvas"); c.className = "patthumb"; c.title = pat.n; c.width = 48; c.height = 58; pat.g(c.getContext("2d"), 48, 58, pat.cols, 0.4); c.onclick = () => applyPattern(pat); gr.appendChild(c); }); }
const patSizeEl = document.getElementById("patSize"); if (patSizeEl) patSizeEl.oninput = e => { patScale = +e.target.value; const v = document.getElementById("patSizeV"); if (v) v.textContent = (+e.target.value).toFixed(1) + "×"; renderCurrentPattern(); };
const patBrandEl = document.getElementById("patBrand"); if (patBrandEl) patBrandEl.onchange = e => { patUseBrand = e.target.checked; renderCurrentPattern(); };

/* ---------- fonts + clip-to-garment ---------- */
let curFont = "Sora", clipOn = false;
const FONTS = ["Sora", "Kanit", "Prompt", "Sarabun", "Pridi", "Chakra Petch", "Anton", "Bebas Neue", "Oswald", "Teko", "Montserrat", "Noto Sans Thai"];
function fontStack(f) { return '"' + f + '", "Noto Sans Thai", sans-serif'; }
function buildFontSelect() {
  const el = document.getElementById("fontSel"); if (!el) return;
  el.innerHTML = FONTS.map(f => `<option value="${f}">${f}</option>`).join("");
  el.value = curFont;
  el.onchange = () => { curFont = el.value; const o = canvas.getActiveObject(); if (o && String(o.type).includes("text")) { o.set("fontFamily", fontStack(curFont)); canvas.requestRenderAll(); pushHistory(); } };
}
function panelOf(obj) {
  const c = obj.getCenterPoint();
  for (let i = 0; i < panels.length; i++) { const p = panels[i]; if (c.x >= p.x && c.x <= p.x + p.w && c.y >= p.y && c.y <= p.y + p.h) return i; }
  let best = 0, bd = Infinity;
  for (let i = 0; i < panels.length; i++) { const p = panels[i], dx = c.x - p.cx, dy = c.y - p.cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  return best;
}
function applyClip(obj) {
  if (!obj || obj._bg || obj._temp) return;
  if (!clipOn) { if (obj.clipPath) { obj.clipPath = null; obj.dirty = true; canvas.requestRenderAll(); } return; }
  const src = panelGroups[panelOf(obj)]; if (!src) return;
  src.clone(cl => { cl.absolutePositioned = true; obj.clipPath = cl; obj.dirty = true; canvas.requestRenderAll(); });
}
function reclipAll() { userObjects().forEach(applyClip); canvas.requestRenderAll(); }

/* ---------- name/number positioning helpers ---------- */
function garmentDims(p) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const d = sz && sz.dims ? (p.tpl === "front" ? sz.dims.front : sz.dims.back) : [46, 55];
  return { gw: d[0] * PX_PER_CM, gh: d[1] * PX_PER_CM };
}
// move the active object(s) so their centre lands at a standard spot on the shirt panel they sit on.
// xFrac/yFrac are fractions of the garment size from its centre; centerXOnly keeps current Y.
function placeOnGarment(xFrac, yFrac, centerXOnly) {
  const objs = canvas.getActiveObjects();
  if (!objs.length) { toast("เลือกข้อความ/วัตถุก่อน"); return; }
  objs.forEach(o => {
    const p = panels[panelOf(o)]; if (!p) return;
    const { gw, gh } = garmentDims(p);
    const c = o.getCenterPoint();
    const dx = centerXOnly ? p.cx : p.cx + xFrac * gw;
    const dy = centerXOnly ? c.y : p.cy + yFrac * gh;
    o.set({ left: o.left + (dx - c.x), top: o.top + (dy - c.y) }); o.setCoords();
    if (clipOn) applyClip(o);
  });
  canvas.requestRenderAll(); pushHistory();
}
let nudgeT = 0;
function nudgeHist() { clearTimeout(nudgeT); nudgeT = setTimeout(pushHistory, 400); }

/* ---------- roster / batch new-order ---------- */
let rosterOrig = null;
function isText(o) { return o && String(o.type).includes("text"); }
function taggedObjs(tag) { return userObjects().filter(o => o.rosterTag === tag && isText(o)); }
function sanitizeName(s) { return String(s == null ? "" : s).replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "x"; }
function updateTagInfo() {
  const el = document.getElementById("tagInfo"); if (!el) return;
  const n = taggedObjs("name").length, num = taggedObjs("number").length;
  const a = canvas.getActiveObject();
  const cur = isText(a) && a.rosterTag ? ` — ที่เลือก: ${a.rosterTag === "name" ? "ช่องชื่อ" : "ช่องเบอร์"}` : "";
  el.innerHTML = `ช่องชื่อ: <b style="color:#fff">${n}</b> · ช่องเบอร์: <b style="color:#fff">${num}</b>${cur}`;
}
function setRosterTag(tag) {
  const o = canvas.getActiveObject();
  if (!isText(o)) { toast("เลือกข้อความบนเสื้อก่อน"); return; }
  o.rosterTag = tag || undefined;
  toast(tag === "name" ? "ตั้งเป็นช่องชื่อแล้ว 🏷" : tag === "number" ? "ตั้งเป็นช่องเบอร์แล้ว #️⃣" : "ล้างแท็กแล้ว");
  updateTagInfo(); refreshLayers(); pushHistory();
}
function parseRoster() {
  const raw = (document.getElementById("rosterText") || {}).value || "";
  return raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    let parts = l.split(/\t|,|;|\|/).map(s => s.trim());
    if (parts.length === 1) {
      const t = parts[0].split(/\s+/);
      if (t.length >= 2 && /^[0-9]{1,3}$/.test(t[t.length - 1])) { const num = t.pop(); return { name: t.join(" "), number: num, size: "" }; }
      return { name: parts[0], number: "", size: "" };
    }
    return { name: parts[0] || "", number: parts[1] || "", size: (parts[2] || "").toUpperCase() };
  }).filter(r => r.name || r.number);
}
function updateRosterCount() {
  const el = document.getElementById("rosterCount"); if (!el) return;
  const n = parseRoster().length; el.textContent = n ? `รวม ${n} คน → ${n} ตัว` : "";
}
function orderName() { const v = (document.getElementById("orderName") || {}).value; return (v && v.trim()) || ("ออเดอร์ทีม " + new Date().toLocaleDateString("th-TH")); }
function applyRow(nameObjs, numObjs, r) {
  nameObjs.forEach(o => o.set("text", r.name || ""));
  numObjs.forEach(o => o.set("text", r.number || ""));
  if (clipOn) reclipAll();
  canvas.requestRenderAll();
}
function rosterPreviewFirst() {
  const rows = parseRoster(); if (!rows.length) { toast("ยังไม่มีรายชื่อ"); return; }
  const nameObjs = taggedObjs("name"), numObjs = taggedObjs("number");
  if (!nameObjs.length && !numObjs.length) { toast("ยังไม่ได้แท็กช่องชื่อ/เบอร์"); return; }
  if (!rosterOrig) rosterOrig = { n: nameObjs.map(o => o.text), m: numObjs.map(o => o.text) };
  applyRow(nameObjs, numObjs, rows[0]);
  toast("ตัวอย่าง: " + (rows[0].name || rows[0].number));
}
function rosterReset() {
  if (!rosterOrig) { toast("ไม่มีอะไรให้คืนค่า"); return; }
  const nameObjs = taggedObjs("name"), numObjs = taggedObjs("number");
  nameObjs.forEach((o, i) => o.set("text", rosterOrig.n[i] !== undefined ? rosterOrig.n[i] : "ชื่อ"));
  numObjs.forEach((o, i) => o.set("text", rosterOrig.m[i] !== undefined ? rosterOrig.m[i] : ""));
  rosterOrig = null;
  if (clipOn) reclipAll(); canvas.requestRenderAll(); toast("คืนค่าเทมเพลตแล้ว");
}
async function generateBatch() {
  if (typeof JSZip === "undefined") { toast("โหลดตัวบีบอัดไม่สำเร็จ ลองรีเฟรช"); return; }
  const rows = parseRoster();
  const nameObjs = taggedObjs("name"), numObjs = taggedObjs("number");
  if (!rows.length) { toast("ยังไม่มีรายชื่อ — วางรายชื่อในช่องก่อน"); return; }
  if (!nameObjs.length && !numObjs.length) { toast("ยังไม่ได้แท็กช่องชื่อ/เบอร์"); return; }
  const prog = document.getElementById("rosterProg");
  const savedN = nameObjs.map(o => o.text), savedM = numObjs.map(o => o.text);
  const zip = new JSZip();
  const folder = zip.folder(sanitizeName(orderName()));
  const used = {};
  const restoreLayout = await enterExportLayout(); // switch to horizontal once if fabric has no border
  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      applyRow(nameObjs, numObjs, r);
      await new Promise(res => setTimeout(res, 24));
      let base = `${r.size || TPL_SIZE}_${String(i + 1).padStart(2, "0")}_${sanitizeName(r.name || r.number)}`;
      used[base] = (used[base] || 0) + 1; if (used[base] > 1) base += "_" + used[base];
      folder.file(base + ".png", exportPNG(2).split(",")[1], { base64: true });
      folder.file(base + ".svg", buildSVGString());
      if (prog) prog.textContent = `กำลังสร้าง ${i + 1}/${rows.length} — ${r.name || r.number}`;
    }
    // add a roster.csv manifest
    folder.file("_roster.csv", "index,name,number,size\n" + rows.map((r, i) => `${i + 1},${(r.name || "").replace(/,/g, " ")},${r.number || ""},${r.size || TPL_SIZE}`).join("\n"));
  } finally {
    nameObjs.forEach((o, i) => o.set("text", savedN[i]));
    numObjs.forEach((o, i) => o.set("text", savedM[i]));
    if (restoreLayout) await restoreLayout(); else if (clipOn) reclipAll();
    canvas.requestRenderAll();
  }
  if (prog) prog.textContent = "กำลังบีบอัด ZIP...";
  const blob = await zip.generateAsync({ type: "blob" });
  download(sanitizeName(orderName()) + ".zip", URL.createObjectURL(blob));
  if (prog) prog.textContent = `เสร็จ ✓ ${rows.length} ตัว (PNG + SVG ต่อคน)`;
  toast("ดาวน์โหลด ZIP แล้ว ✓");
}
function saveOrder() {
  const rows = parseRoster();
  if (!taggedObjs("name").length && !taggedObjs("number").length) { toast("แท็กช่องชื่อ/เบอร์ก่อนบันทึก"); return; }
  if (!rows.length) { toast("ยังไม่มีรายชื่อ"); return; }
  const orderDoc = { app: "axiom-roster", version: 1, name: orderName(), style: curStyle, size: TPL_SIZE, roster: rows, template: getDoc(), savedAt: new Date().toISOString() };
  const preview = exportPNG(0.5);
  const prog = document.getElementById("rosterProg");
  if (inFrame() && isLoggedIn) {
    window.parent.postMessage({ type: "axiom-save-order", payload: { name: orderName(), style: curStyle, size: TPL_SIZE, count: rows.length, doc: orderDoc, preview } }, "*");
    if (prog) prog.textContent = "กำลังบันทึกออเดอร์...";
    toast("กำลังบันทึกออเดอร์...");
  } else if (inFrame()) {
    toast("ยังไม่เข้าสู่ระบบ — ดาวน์โหลดไฟล์ออเดอร์แทน");
    download(sanitizeName(orderName()) + ".order.axiom", URL.createObjectURL(new Blob([JSON.stringify(orderDoc)], { type: "application/json" })));
  } else {
    download(sanitizeName(orderName()) + ".order.axiom", URL.createObjectURL(new Blob([JSON.stringify(orderDoc)], { type: "application/json" })));
    toast("ดาวน์โหลดไฟล์ออเดอร์แล้ว");
  }
}

/* ---------- New Order wizard (beginner-friendly) ---------- */
let wizStep = 1, wizName = "", wizLayout = "num_name_above";
let wizRows = [{ name: "", number: "", size: "M" }];
const WIZ_STEPS = ["แบบ", "รายชื่อ", "วางชื่อ-เบอร์", "สร้าง"];
// each preset defines default placements (fractions of garment size from centre); objects stay movable afterwards
const WIZ_LAYOUTS = [
  { id: "n_lchest", label: "1.1 เบอร์: อกซ้าย + กลางหลัง", desc: "เบอร์เล็กที่อกซ้ายหน้า · เบอร์ใหญ่กลางหลัง", items: [
    { tag: "number", side: "front", x: -0.22, y: -0.14, fs: 30 }, { tag: "number", side: "back", x: 0, y: 0, fs: 105 } ] },
  { id: "n_cchest", label: "1.2 เบอร์: กลางอก + กลางหลัง", desc: "เบอร์กลางอกหน้า · เบอร์ใหญ่กลางหลัง", items: [
    { tag: "number", side: "front", x: 0, y: -0.12, fs: 34 }, { tag: "number", side: "back", x: 0, y: 0, fs: 105 } ] },
  { id: "n_full", label: "1.3 เบอร์: เต็มหน้า + เต็มหลัง", desc: "เบอร์ใหญ่ทั้งหน้าและหลัง", items: [
    { tag: "number", side: "front", x: 0, y: 0, fs: 100 }, { tag: "number", side: "back", x: 0, y: 0, fs: 105 } ] },
  { id: "num_name_above", label: "2. หน้าเบอร์ + หลัง(ชื่อบน+เบอร์ใหญ่)", desc: "หน้า: เบอร์ที่อก · หลัง: ชื่ออยู่บน เบอร์ใหญ่ล่าง", items: [
    { tag: "number", side: "front", x: 0, y: -0.12, fs: 32 }, { tag: "name", side: "back", x: 0, y: -0.30, fs: 30 }, { tag: "number", side: "back", x: 0, y: 0.04, fs: 100 } ] },
  { id: "num_name_below", label: "3. หน้าเบอร์ + หลัง(เบอร์ใหญ่+ชื่อล่าง)", desc: "หน้า: เบอร์ที่อก · หลัง: เบอร์ใหญ่ ชื่ออยู่ล่าง", items: [
    { tag: "number", side: "front", x: 0, y: -0.12, fs: 32 }, { tag: "number", side: "back", x: 0, y: -0.06, fs: 100 }, { tag: "name", side: "back", x: 0, y: 0.34, fs: 30 } ] },
  { id: "name_name", label: "4. ชื่อ + ชื่อ", desc: "ชื่ออยู่ทั้งด้านหน้าและด้านหลัง", items: [
    { tag: "name", side: "front", x: 0, y: -0.05, fs: 40 }, { tag: "name", side: "back", x: 0, y: -0.05, fs: 46 } ] },
  { id: "nn_both", label: "5. ชื่อ+เบอร์ หน้า · ชื่อ+เบอร์ หลัง", desc: "ชื่อและเบอร์ครบทั้งสองด้าน", items: [
    { tag: "name", side: "front", x: 0, y: -0.16, fs: 28 }, { tag: "number", side: "front", x: 0, y: 0.08, fs: 48 }, { tag: "name", side: "back", x: 0, y: -0.30, fs: 30 }, { tag: "number", side: "back", x: 0, y: 0.04, fs: 100 } ] },
  { id: "front_only", label: "6. เบอร์+ชื่อ ด้านหน้าอย่างเดียว", desc: "ทุกอย่างอยู่ด้านหน้า (ลบชื่อออกได้ถ้าเอาเบอร์อย่างเดียว)", items: [
    { tag: "name", side: "front", x: 0, y: -0.20, fs: 30 }, { tag: "number", side: "front", x: 0, y: 0.06, fs: 80 } ] },
  { id: "back_only", label: "7. เบอร์+ชื่อ ด้านหลังอย่างเดียว", desc: "ทุกอย่างอยู่ด้านหลัง (ลบชื่อออกได้ถ้าเอาเบอร์อย่างเดียว)", items: [
    { tag: "name", side: "back", x: 0, y: -0.30, fs: 30 }, { tag: "number", side: "back", x: 0, y: 0.04, fs: 105 } ] },
];
function frontIdx() { const i = panels.findIndex(p => p.tpl === "front"); return i < 0 ? 0 : i; }
function backIdx() { const i = panels.findIndex(p => p.tpl === "back"); return i < 0 ? frontIdx() : i; }
function addTagged(txt, tag, pIdx, xFrac, yFrac, fs) {
  const p = panels[pIdx]; if (!p) return;
  const { gw, gh } = garmentDims(p);
  const t = new fabric.IText(txt, { left: p.cx + xFrac * gw, top: p.cy + yFrac * gh, originX: "center", originY: "center", fill: "#111111", fontFamily: fontStack(curFont), fontSize: fs, textAlign: "center", fontWeight: "700" });
  t.rosterTag = tag; canvas.add(t);
}
function applyWizLayout() {
  userObjects().filter(o => o.rosterTag).forEach(o => canvas.remove(o));
  const preset = WIZ_LAYOUTS.find(l => l.id === wizLayout) || WIZ_LAYOUTS[0];
  const fi = frontIdx(), bi = backIdx();
  (preset.items || []).forEach(it => addTagged(it.tag === "name" ? "ชื่อ" : "00", it.tag, it.side === "back" ? bi : fi, it.x, it.y, it.fs));
  fixBackOrder(); if (clipOn) reclipAll(); canvas.requestRenderAll(); refreshLayers(); updateTagInfo();
}
function syncWizRows() {
  const rt = document.getElementById("rosterText");
  if (rt) rt.value = wizRows.filter(r => r.name || r.number).map(r => [r.name, r.number, r.size || TPL_SIZE].filter(v => v !== "").join("\t")).join("\n");
  updateRosterCount();
}
function wizEsc(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;"); }
function updateWizCount() { const el = document.getElementById("wizCount"); if (el) { const n = wizRows.filter(r => r.name || r.number).length; el.textContent = n ? `รวม ${n} คน` : "ยังไม่มีรายชื่อ"; } }
function renderWizTable(body) {
  const rows = wizRows.map((r, i) => `<tr>
    <td style="padding:2px"><input data-wr="${i}" data-wf="name" value="${wizEsc(r.name)}" placeholder="ชื่อ" style="width:100%"></td>
    <td style="padding:2px;width:60px"><input data-wr="${i}" data-wf="number" value="${wizEsc(r.number)}" placeholder="เบอร์" style="width:100%"></td>
    <td style="padding:2px;width:60px"><select data-wr="${i}" data-wf="size" style="width:100%">${["S", "M", "L", "XL"].map(s => `<option ${(r.size || TPL_SIZE) === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
    <td style="padding:2px;width:26px"><button class="mini" data-wdel="${i}" style="min-width:24px;padding:4px">✕</button></td></tr>`).join("");
  body.innerHTML = `<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">ใส่รายชื่อผู้เล่น — พิมพ์เอง หรือวางจาก Excel</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="color:var(--muted);font-size:11px"><th style="text-align:left;padding:2px">ชื่อ</th><th style="padding:2px">เบอร์</th><th style="padding:2px">ไซซ์</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="btnrow" style="margin-top:8px"><button class="mini" id="wizAddRow">+ เพิ่มคน</button><button class="mini" id="wizPasteToggle">📋 วางจาก Excel</button></div>
    <textarea id="wizPaste" placeholder="วางจาก Excel: ชื่อ[Tab]เบอร์[Tab]ไซซ์ ต่อบรรทัด" style="display:none;width:100%;box-sizing:border-box;margin-top:8px;height:90px;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:7px;color:var(--txt);font-size:12px;font-family:inherit"></textarea>
    <button class="mini" id="wizPasteApply" style="display:none;margin-top:6px">↵ นำเข้ารายชื่อ</button>
    <div id="wizCount" style="font-size:11.5px;color:var(--muted);margin-top:8px"></div>`;
  body.querySelectorAll("[data-wr]").forEach(el => { el.oninput = el.onchange = () => { wizRows[+el.dataset.wr][el.dataset.wf] = el.value; updateWizCount(); }; });
  body.querySelectorAll("[data-wdel]").forEach(b => b.onclick = () => { wizRows.splice(+b.dataset.wdel, 1); if (!wizRows.length) wizRows.push({ name: "", number: "", size: TPL_SIZE }); renderWizTable(body); });
  const add = document.getElementById("wizAddRow"); if (add) add.onclick = () => { wizRows.push({ name: "", number: "", size: TPL_SIZE }); renderWizTable(body); };
  const pt = document.getElementById("wizPasteToggle"); if (pt) pt.onclick = () => { const t = document.getElementById("wizPaste"), a = document.getElementById("wizPasteApply"); const show = t.style.display === "none"; t.style.display = a.style.display = show ? "block" : "none"; };
  const pa = document.getElementById("wizPasteApply"); if (pa) pa.onclick = () => {
    const parsed = (document.getElementById("wizPaste").value || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const p = l.split(/\t|,|;/).map(s => s.trim()); return { name: p[0] || "", number: p[1] || "", size: (p[2] || TPL_SIZE).toUpperCase() }; });
    if (parsed.length) { wizRows = parsed; renderWizTable(body); }
  };
  updateWizCount();
}
function renderWizard() {
  const stepsEl = document.getElementById("wizSteps");
  if (stepsEl) stepsEl.innerHTML = WIZ_STEPS.map((s, i) => `<div style="flex:1;text-align:center;font-size:10.5px;padding:7px 2px;border-radius:6px;background:${i + 1 === wizStep ? "#2563eb" : "var(--panel2)"};color:${i + 1 === wizStep ? "#fff" : "var(--muted)"};font-weight:${i + 1 === wizStep ? "700" : "400"}">${i + 1}. ${s}</div>`).join("");
  const body = document.getElementById("wizBody"); if (!body) return;
  if (wizStep === 1) {
    body.innerHTML = `<label style="font-size:12px;color:var(--muted)">ชื่อออเดอร์/ทีม</label>
      <input type="text" id="wizName" value="${wizEsc(wizName)}" placeholder="เช่น SAKURAGI ทีม A" style="width:100%;box-sizing:border-box;margin:6px 0 14px">
      <label style="font-size:12px;color:var(--muted)">รูปแบบชื่อ-เบอร์บนเสื้อ</label>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">${WIZ_LAYOUTS.map(l => `<label style="display:flex;gap:9px;align-items:flex-start;padding:10px;border:1.5px solid ${wizLayout === l.id ? "#2563eb" : "var(--line2)"};border-radius:9px;cursor:pointer"><input type="radio" name="wizLo" value="${l.id}" ${wizLayout === l.id ? "checked" : ""} style="margin-top:2px"><span><b style="font-size:13px">${l.label}</b><br><span style="font-size:11.5px;color:var(--muted)">${l.desc}</span></span></label>`).join("")}</div>`;
    const nm = document.getElementById("wizName"); if (nm) nm.oninput = () => { wizName = nm.value; };
    body.querySelectorAll('input[name="wizLo"]').forEach(r => r.onchange = () => { wizLayout = r.value; renderWizard(); });
  } else if (wizStep === 2) { renderWizTable(body); }
  else if (wizStep === 3) {
    applyWizLayout(); syncWizRows();
    body.innerHTML = `<p style="font-size:13px;margin-bottom:10px">✅ วาง <b>ชื่อ/เบอร์อัตโนมัติ</b> บนเสื้อให้แล้วตามรูปแบบที่เลือก</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px">กด "ดูตัวอย่าง" เพื่อเห็นชื่อคนแรกบนเสื้อ · ถ้าอยากขยับตำแหน่ง ปิดหน้าต่างนี้แล้วลากปรับ/กดลูกศรได้เลย</p>
      <div class="btnrow"><button class="mini" id="wizPrev">👁 ดูตัวอย่างคนแรก</button><button class="mini" id="wizPrevReset">↺ คืนค่า</button></div>`;
    const pv = document.getElementById("wizPrev"); if (pv) pv.onclick = rosterPreviewFirst;
    const pr = document.getElementById("wizPrevReset"); if (pr) pr.onclick = rosterReset;
  } else if (wizStep === 4) {
    syncWizRows(); const on = document.getElementById("orderName"); if (on) on.value = wizName || on.value;
    const n = wizRows.filter(r => r.name || r.number).length;
    body.innerHTML = `<p style="font-size:14px;margin-bottom:6px"><b>${wizEsc(wizName) || "ออเดอร์ทีม"}</b> — ${n} คน</p>
      <p style="font-size:12px;color:var(--muted);margin-bottom:14px">พร้อมสร้างไฟล์ต่อคน (หน้า+หลัง) หรือบันทึกออเดอร์เข้าบัญชี</p>
      <button class="mini" id="wizGen" style="width:100%;box-sizing:border-box;height:40px;margin-bottom:8px;background:#2563eb;color:#fff;border-color:transparent;font-weight:700">⚙ สร้างทั้งทีม → ดาวน์โหลด ZIP</button>
      <button class="mini" id="wizSave" style="width:100%;box-sizing:border-box;height:36px">💾 บันทึกออเดอร์เข้าบัญชี</button>
      <div id="wizProg" style="font-size:11.5px;color:var(--muted);margin-top:10px"></div>`;
    const g = document.getElementById("wizGen"); if (g) g.onclick = async () => { const pr = document.getElementById("wizProg"); if (pr) pr.textContent = "กำลังสร้าง..."; await generateBatch(); const rp = document.getElementById("rosterProg"); if (pr) pr.textContent = rp ? rp.textContent : "เสร็จ ✓"; };
    const s = document.getElementById("wizSave"); if (s) s.onclick = () => { const pr = document.getElementById("wizProg"); if (pr) pr.textContent = "กำลังบันทึก..."; saveOrder(); };
  }
  const back = document.getElementById("wizBack"); if (back) back.style.visibility = wizStep > 1 ? "visible" : "hidden";
  const nx = document.getElementById("wizNext"); if (nx) nx.textContent = wizStep < 4 ? "ถัดไป →" : "ปิด";
}
function openWizard() { wizStep = 1; if (!wizRows.length) wizRows = [{ name: "", number: "", size: TPL_SIZE }]; const m = document.getElementById("wizModal"); if (m) m.classList.add("on"); renderWizard(); }
function closeWizard() { const m = document.getElementById("wizModal"); if (m) m.classList.remove("on"); }
function wizNextStep() { if (wizStep < 4) { wizStep++; renderWizard(); } else closeWizard(); }
function wizBackStep() { if (wizStep > 1) { wizStep--; renderWizard(); } }

function bindRoster() {
  const g = id => document.getElementById(id);
  if (g("tagName")) g("tagName").onclick = () => setRosterTag("name");
  if (g("tagNumber")) g("tagNumber").onclick = () => setRosterTag("number");
  if (g("tagClear")) g("tagClear").onclick = () => setRosterTag(null);
  if (g("rosterText")) g("rosterText").oninput = updateRosterCount;
  if (g("rosterPreview")) g("rosterPreview").onclick = rosterPreviewFirst;
  if (g("rosterReset")) g("rosterReset").onclick = rosterReset;
  if (g("rosterGen")) g("rosterGen").onclick = () => generateBatch();
  if (g("rosterSave")) g("rosterSave").onclick = saveOrder;
  const P = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  P("wizOpen", openWizard);
  P("wizNext", wizNextStep);
  P("wizBack", wizBackStep);
  document.querySelectorAll("[data-wizclose]").forEach(b => b.onclick = closeWizard);
  P("advToggle", () => { const a = document.getElementById("rosterAdv"), t = document.getElementById("advToggle"); if (a) { const show = a.style.display === "none"; a.style.display = show ? "block" : "none"; if (t) t.textContent = "⚙ เครื่องมือขั้นสูง (ทำเอง) " + (show ? "▴" : "▾"); } });
  P("posCenter", () => placeOnGarment(0, 0, true));
  P("posNameTop", () => placeOnGarment(0, -0.30));
  P("posNumChest", () => placeOnGarment(0, -0.10));
  P("posNumBig", () => placeOnGarment(0, 0));
  P("posNameBot", () => placeOnGarment(0, 0.30));
  P("posHint", () => toast("ลูกศร=ขยับ1 · Shift+ลูกศร=10 · C=กลางเสื้อ · Ctrl+C/V=คัดลอก/วาง · Ctrl+D=ทำซ้ำ"));
  canvas.on("selection:created", updateTagInfo);
  canvas.on("selection:updated", updateTagInfo);
  canvas.on("selection:cleared", updateTagInfo);
  updateTagInfo(); updateRosterCount();
}
function bindCut() {
  const on = document.getElementById("cutOn"), mm = document.getElementById("cutMm"), mmv = document.getElementById("cutMmV");
  if (on) on.onchange = () => { cutOn = on.checked; rebuildLayout(); if (clipOn) setTimeout(reclipAll, 200); };
  if (mm) mm.oninput = () => { cutMm = +mm.value; if (mmv) mmv.textContent = cutMm + " มม."; rebuildLayout(); if (clipOn) setTimeout(reclipAll, 200); };
}

initCanvas();
bindExtra();
buildSwatches();
buildGarmentGrid("bodyGrid", setBodyColor);
buildGarmentGrid("trimGrid", setTrimColor);
buildPatternGallery();
buildFontSelect();
bindRoster();
bindCut();
const btnClipEl = document.getElementById("btnClip");
if (btnClipEl) btnClipEl.onclick = () => { clipOn = !clipOn; btnClipEl.classList.toggle("solid", clipOn); reclipAll(); toast(clipOn ? "ตัดในทรง: เปิด" : "ตัดในทรง: ปิด"); };
if (bodyPickEl) bodyPickEl.value = "#ffffff";
if (trimPickEl) trimPickEl.value = "#e6ecf5";
setTarget("fill");
refreshLayers();
syncProps();
pushHistory();
hint(HINTS.select);
updateDim();
const vtEl = document.getElementById("viewToggle"); if (vtEl) vtEl.style.display = "none";
setTimeout(() => { resize(); zoomFit(); }, 80);
window.addEventListener("load", () => { resize(); zoomFit(); });
if (window.parent && window.parent !== window) window.parent.postMessage({ type: "axiom-ready" }, "*");
/* roster-new-order build */
