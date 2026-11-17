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
let customInks = {}; // screen colour → [c, m, y, k] the customer typed
const cmykText = c => `C${c[0]} M${c[1]} Y${c[2]} K${c[3]}`;
function parseCmykText(s) { const m = /C\s*([\d.]+)\s+M\s*([\d.]+)\s+Y\s*([\d.]+)\s+K\s*([\d.]+)/i.exec(s || ""); return m ? m.slice(1).map(Number) : null; }
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
      <button class="mini" id="wizOpen" style="width:100%;box-sizing:border-box;margin-bottom:7px;background:#f26522;color:#0d0e10;border-color:transparent;height:40px;font-weight:700;font-size:13px">🧾 สร้างออเดอร์ทีม (ง่ายๆ)</button>
      <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:8px">ทำทีละขั้น: เลือกแบบ → ใส่รายชื่อ → วางชื่อ-เบอร์อัตโนมัติ → สร้างไฟล์/บันทึก</div>
      <div id="advToggle" style="font-size:11px;color:#ff9a66;cursor:pointer;margin-bottom:8px;user-select:none">⚙ เครื่องมือขั้นสูง (ทำเอง) ▾</div>
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
      <button class="mini" id="rosterGen" style="width:100%;box-sizing:border-box;margin-bottom:6px;height:34px;font-weight:700">⚙ สร้างทั้งทีม → ZIP</button>
      <button class="mini" id="rosterOrder" style="width:100%;box-sizing:border-box;margin-bottom:6px;height:36px;background:#f26522;color:#0d0e10;border-color:transparent;font-weight:700">🧵 สั่งผลิตเลย →</button>
      <button class="mini" id="rosterSave" style="width:100%;box-sizing:border-box;height:32px">💾 บันทึกออเดอร์เข้าบัญชี</button>
      <div id="rosterProg" style="font-size:11px;color:var(--muted);margin-top:8px"></div>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Appearance</div>
    <div class="pbody">
      <div class="row" id="fontRow" style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <label style="min-width:38px">ฟอนต์</label>
        <select id="fontSel" style="flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:6px 8px;color:var(--txt);font-size:12px;font-family:inherit"></select>
        <button class="mini" id="btnFontImport" title="นำเข้าฟอนต์จากเครื่อง (.ttf .otf .woff)" style="min-width:30px;padding:6px 8px;font-size:14px;line-height:1;flex:none">＋</button>
        <input type="file" id="fileFont" accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff" style="display:none">
      </div>
      <div id="textRow" style="display:none;margin-bottom:10px">
        <div class="row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ขนาด</label>
          <input type="number" id="txSize" min="4" max="400" step="1" style="width:64px">
          <button class="mini" id="txBold" title="ตัวหนา" style="min-width:34px;font-weight:800">B</button>
          <button class="mini" id="txItal" title="ตัวเอียง" style="min-width:34px;font-style:italic">I</button>
        </div>
        <div class="row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ระยะตัวอักษร</label>
          <input type="range" id="txSpace" min="-100" max="800" step="10" value="0" style="flex:1">
          <span id="txSpaceV" style="min-width:34px;font-size:11px;color:var(--muted)">0</span>
        </div>
        <div class="row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">โค้ง</label>
          <input type="range" id="txArc" min="-100" max="100" step="1" value="0" style="flex:1">
          <span id="txArcV" style="min-width:34px;font-size:11px;color:var(--muted)">0</span>
        </div>
        <div class="row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px" title="ดัดรูปข้อความ (Warp) แบบใน Illustrator">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ดัดรูป</label>
          <select id="txWarp" style="flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:5px 6px;color:var(--txt);font-size:12px;font-family:inherit">
            <option value="none">ไม่ดัด</option>
            <option value="arc">โค้งทั้งคำ (Arc)</option>
            <option value="arcUpper">โค้งด้านบน (Arc Upper)</option>
            <option value="arcLower">โค้งด้านล่าง (Arc Lower)</option>
            <option value="arch">สะพาน (Arch)</option>
            <option value="bulge">พองกลาง (Bulge)</option>
            <option value="flag">ธงพลิ้ว (Flag)</option>
            <option value="rise">ไต่ขึ้น (Rise)</option>
          </select>
        </div>
        <div class="row" id="txBendRow" style="display:none;align-items:center;gap:8px;margin-bottom:6px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ระดับดัด</label>
          <input type="range" id="txBend" min="-100" max="100" step="1" value="50" style="flex:1">
          <span id="txBendV" style="min-width:34px;font-size:11px;color:var(--muted)">50</span>
        </div>
        <div class="row" id="txPathRow" style="display:none;align-items:center;gap:6px;margin-bottom:6px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ตามเส้น</label>
          <input type="range" id="txPathOff" min="-100" max="100" step="1" value="0" style="flex:1" title="เลื่อนข้อความไปตามเส้น (0 = กึ่งกลาง)">
          <button class="mini" id="txPathFlip" title="ข้อความไปอีกด้านของเส้น (Flip)" style="flex:none;min-width:0;padding:5px 7px">⇅</button>
          <button class="mini" id="txPathOut" title="ถอดข้อความออกจากเส้น (ได้ข้อความกับเส้นคืน)" style="flex:none;min-width:0;padding:5px 7px">✂</button>
        </div>
        <div class="row" id="txEditRow" style="display:none;align-items:center;gap:8px;margin-bottom:4px">
          <label style="min-width:52px;font-size:11.5px;color:var(--muted)">ข้อความ</label>
          <input type="text" id="txText" placeholder="แก้ข้อความโค้ง" style="flex:1">
        </div>
        <div style="font-size:10.5px;color:var(--muted);line-height:1.5">โค้งขึ้น = ค่าบวก (ชื่อทีมเหนืออก) · โค้งลง = ค่าลบ · ตั้งเป็น 0 เพื่อกลับเป็นข้อความปกติ</div>
      </div>
      <div class="fillbox" style="margin-bottom:10px">
        <button class="swbtn on" id="fillBtn"><span class="chip" id="fillChip"></span>Fill</button>
        <button class="swbtn" id="strokeBtn"><span class="chip" id="strokeChip"></span>Stroke</button>
      </div>
      <div class="row"><label>เส้นขอบ</label><div class="num" style="flex:1"><input type="range" id="swRange" min="0" max="40" step="0.5" value="0"><span id="swVal" style="min-width:26px">0</span></div></div>
      <div class="row" title="มุมของเส้นขอบ (Corner) แบบ Stroke panel ใน Illustrator — ใช้กับขอบนอก (Offset) ด้วย">
        <label>มุมขอบ</label>
        <div class="btnrow" style="flex:1">
          <button class="mini" data-join="round" title="มุมมน (Round Join)">◜ มน</button>
          <button class="mini" data-join="miter" title="มุมแหลม (Miter Join)">◸ แหลม</button>
          <button class="mini" data-join="bevel" title="มุมตัด (Bevel Join)">⬠ ตัด</button>
        </div>
      </div>
      <div class="row"><label>ความทึบ</label><div class="num" style="flex:1"><input type="range" id="opRange" min="0" max="100" value="100"><span id="opVal" style="min-width:26px">100</span></div></div>
      <div class="row" title="Offset Path: ขอบนอกรอบตัวอักษร/รูปทรง เป็นชั้นใหม่ด้านหลัง (ทำซ้ำได้หลายชั้น)">
        <label>ขอบนอก</label>
        <input type="number" id="offMm" value="3" min="0.5" max="50" step="0.5" style="width:58px">
        <span style="font-size:10.5px;color:var(--muted)">มม.</span>
        <button class="mini" id="btnOffset">＋ Offset</button>
      </div>
    </div>
  </div>
  <div class="panel" id="gradPanel">
    <div class="phead">Gradient · ไล่สี</div>
    <div class="pbody">
      <div class="btnrow" style="margin-bottom:8px">
        <button class="mini" data-gtype="none" title="สีเดียว">■ สีเดียว</button>
        <button class="mini" data-gtype="linear" title="ไล่สีเส้นตรง (Linear)">▤ เส้นตรง</button>
        <button class="mini" data-gtype="radial" title="ไล่สีวงกลม (Radial)">◎ วงกลม</button>
      </div>
      <div id="gradEdit" style="display:none">
        <div id="gradBar" title="คลิกบนแถบเพื่อเพิ่มจุดสี" style="position:relative;height:22px;border-radius:5px;border:1px solid var(--line2);margin:2px 7px 26px;cursor:copy"></div>
        <div class="row"><label>มุม</label><input type="number" id="gAngle" step="15" style="width:64px"><button class="mini" id="gRev" title="กลับด้านไล่สี">⇄ กลับด้าน</button><button class="mini" id="gDel" title="ลบจุดสีที่เลือก">− จุดสี</button></div>
        <div class="row"><label>ตำแหน่ง</label><div class="num" style="flex:1"><input type="range" id="gPos" min="0" max="100"><span id="gPosV" style="min-width:30px"></span></div></div>
        <div style="font-size:10.5px;color:var(--muted);line-height:1.5">เลือกจุดสีใต้แถบ แล้วคลิกสีใน Swatches · คลิกแถบเพื่อเพิ่มจุดสี · ลากจุดสีเพื่อเลื่อน · พิมพ์ออกเป็นไล่สี CMYK แบบใน Illustrator</div>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Transform</div>
    <div class="pbody">
      <div class="grid2" style="margin-bottom:7px" title="ตำแหน่งกึ่งกลางชิ้นงาน วัดจากมุมซ้ายบนของตัวเสื้อ (มม.)">
        <div class="num"><span>X</span><input type="number" id="tX" step="1"></div>
        <div class="num"><span>Y</span><input type="number" id="tY" step="1"></div>
      </div>
      <div class="grid2" style="margin-bottom:7px" title="ขนาดจริงตอนพิมพ์ (มม.)">
        <div class="num"><span>W</span><input type="number" id="tW" step="1"></div>
        <div class="num"><span>H</span><input type="number" id="tH" step="1"></div>
      </div>
      <div class="row" style="margin-bottom:9px">
        <div class="num" style="flex:1"><span>∠</span><input type="number" id="tR" placeholder="องศา"></div>
        <label style="min-width:0;display:flex;align-items:center;gap:4px;cursor:pointer" title="ล็อกสัดส่วน กว้าง-สูง"><input type="checkbox" id="tLock" checked>🔗</label>
        <span style="font-size:10.5px;color:var(--muted)">มม.</span>
      </div>
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
      <div class="btnrow" style="margin-top:7px">
        <button class="mini" data-flip="x" title="สะท้อนซ้าย-ขวา (Reflect)">⇋</button>
        <button class="mini" data-flip="y" title="สะท้อนบน-ล่าง (Reflect)">⇵</button>
        <button class="mini" data-dist="h" title="เว้นระยะห่างเท่ากัน แนวนอน (เลือก 3 ชิ้นขึ้นไป)">↔⋯</button>
        <button class="mini" data-dist="v" title="เว้นระยะห่างเท่ากัน แนวตั้ง (เลือก 3 ชิ้นขึ้นไป)">↕⋮</button>
      </div>
      <div style="margin-top:9px;padding-top:8px;border-top:1px solid var(--line)" title="Step and Repeat: ทำซ้ำชิ้นที่เลือกเป็นแถว/ตาราง ระยะเป็น มม. (นับชิ้นเดิมเป็นช่องแรก)">
        <div class="grid2" style="margin-bottom:6px">
          <div class="num"><span title="คอลัมน์">↔</span><input type="number" id="repCols" value="3" min="1" max="50"></div>
          <div class="num"><span title="แถว">↕</span><input type="number" id="repRows" value="1" min="1" max="50"></div>
          <div class="num"><span title="ระยะ X (มม.) — จากจุดกึ่งกลางถึงจุดกึ่งกลาง">X</span><input type="number" id="repDx" value="60" step="1"></div>
          <div class="num"><span title="ระยะ Y (มม.)">Y</span><input type="number" id="repDy" value="60" step="1"></div>
        </div>
        <div class="row" style="margin-bottom:0;gap:6px">
          <div class="num" style="flex:1"><span title="หมุนเพิ่มทีละ (องศา)">∠</span><input type="number" id="repRot" value="0" step="5"></div>
          <button class="mini" id="btnRepeat" style="flex:none">⧉ ทำซ้ำ</button>
        </div>
      </div>
      <div style="font-size:10.5px;color:var(--muted);line-height:1.5;margin-top:6px">จัดชิด: ชิ้นเดียว = เทียบกับตัวเสื้อ · หลายชิ้น = เทียบกันเอง</div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">Pathfinder</div>
    <div class="pbody">
      <div class="btnrow">
        <button class="mini" data-pf="unite" title="รวมรูปทรง (Unite) — ใช้สีของชิ้นบนสุด">⊕ รวม</button>
        <button class="mini" data-pf="minus" title="ลบด้านหน้า (Minus Front) — ชิ้นล่างสุดถูกเจาะด้วยชิ้นที่อยู่บน">⊖ เจาะ</button>
        <button class="mini" data-pf="intersect" title="เหลือส่วนที่ซ้อนกัน (Intersect)">⊗ ซ้อน</button>
        <button class="mini" data-pf="exclude" title="ตัดส่วนที่ซ้อนกันออก (Exclude)">⊘ ตัดซ้อน</button>
      </div>
      <div class="btnrow" style="margin-top:6px">
        <button class="mini" id="btnTextPath" title="Type on a Path: เลือกข้อความ 1 ชิ้น + เส้นที่วาด (ปากกา/เส้น/วงกลม) 1 ชิ้น — ข้อความจะวิ่งตามเส้น">〰 ข้อความตามเส้น</button>
      </div>
      <div style="font-size:10.5px;color:var(--muted);line-height:1.5;margin-top:6px">เลือก 2 ชิ้นขึ้นไป (Shift+คลิก) · ข้อความจะถูกแปลงเป็นเส้นก่อน</div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">🎽 สีตัวเสื้อ</div>
    <div class="pbody">
      <div class="btnrow" id="sideRow" style="display:none;margin-bottom:8px" title="เสื้อสองด้าน: สีและลายเต็มตัวใส่ทั้งสองด้าน หรือแยกด้านนอก/ด้านใน">
        <button class="mini on" data-bside="both">ทั้ง 2 ด้าน</button>
        <button class="mini" data-bside="A">ด้านนอก</button>
        <button class="mini" data-bside="B">ด้านใน</button>
      </div>
      <div class="btnrow" style="margin-bottom:7px">
        <input type="color" id="bodyPick" style="width:40px;height:30px;border:0;background:none;padding:0" title="เลือกสีเอง">
        <button class="mini" id="bodyWhite" title="ขาว">ขาว</button>
        <span class="swcode" id="bodyCode" style="align-self:center"></span>
      </div>
      <div class="swatches" id="bodyGrid"></div>
      <div class="row" style="margin:8px 0 0;gap:4px" title="ใส่ค่า CMYK เอง (0–100) — โรงงานพิมพ์ค่านี้ตรงๆ">
        <label style="min-width:36px">CMYK</label>
        <input type="number" class="ck" data-ck="body" min="0" max="100" step="0.5" placeholder="C">
        <input type="number" class="ck" data-ck="body" min="0" max="100" step="0.5" placeholder="M">
        <input type="number" class="ck" data-ck="body" min="0" max="100" step="0.5" placeholder="Y">
        <input type="number" class="ck" data-ck="body" min="0" max="100" step="0.5" placeholder="K">
        <button class="mini" data-ckapply="body" style="flex:none;min-width:0;padding:6px 8px">ใช้</button>
      </div>
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
      <div class="row" style="margin:8px 0 0;gap:4px" title="ใส่ค่า CMYK เอง (0–100) — โรงงานพิมพ์ค่านี้ตรงๆ">
        <label style="min-width:36px">CMYK</label>
        <input type="number" class="ck" data-ck="trim" min="0" max="100" step="0.5" placeholder="C">
        <input type="number" class="ck" data-ck="trim" min="0" max="100" step="0.5" placeholder="M">
        <input type="number" class="ck" data-ck="trim" min="0" max="100" step="0.5" placeholder="Y">
        <input type="number" class="ck" data-ck="trim" min="0" max="100" step="0.5" placeholder="K">
        <button class="mini" data-ckapply="trim" style="flex:none;min-width:0;padding:6px 8px">ใช้</button>
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="phead">ลายเต็มตัว (Sublimation)</div>
    <div class="pbody">
      <div class="aibox">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:6px">✨ ให้ AI ออกแบบลาย</div>
        <textarea id="aiPrompt" rows="2" maxlength="300" placeholder="บอกลายที่อยากได้ เช่น สายฟ้าเหลือง-ดำ ดุๆ แบบทีมบาส" style="width:100%;box-sizing:border-box;resize:vertical;background:var(--panel2);border:1px solid var(--line2);border-radius:6px;padding:7px 8px;color:var(--txt);font-size:12px;font-family:inherit;line-height:1.5"></textarea>
        <div id="aiChips" style="display:flex;flex-wrap:wrap;gap:5px;margin:6px 0"></div>
        <div class="btnrow">
          <button class="mini" id="aiGo" style="flex:2;font-weight:700;background:var(--accent);color:var(--oninv);border-color:transparent">✨ ออกแบบ</button>
          <button class="mini" id="aiDemo" title="ลองสูตรลายตัวอย่าง (ไม่ใช้ AI)">🎲 ตัวอย่าง</button>
        </div>
        <div id="aiMsg" style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.5"></div>
        <div class="patgrid" id="aiResults" style="grid-template-columns:repeat(4,1fr)"></div>
        <div id="aiTweak" style="display:none;margin-top:8px;padding-top:7px;border-top:1px solid var(--line2)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:5px">ปรับลายที่ใส่อยู่ (ไม่ต้องเรียก AI ใหม่)</div>
          <div class="btnrow">
            <button class="mini" data-aitw="smaller" title="ลายเล็กลง">− ขนาด</button>
            <button class="mini" data-aitw="bigger" title="ลายใหญ่ขึ้น">＋ ขนาด</button>
            <button class="mini" data-aitw="fainter" title="ลายจางลง (อ่านเบอร์/ชื่อง่ายขึ้น)">จางลง</button>
            <button class="mini" data-aitw="stronger" title="ลายเข้มขึ้น">เข้มขึ้น</button>
          </div>
          <div class="btnrow" style="margin-top:5px">
            <button class="mini" data-aitw="shuffle" title="สุ่มตำแหน่งลายใหม่ (สีและแบบเดิม)">🎲 สุ่มใหม่</button>
            <button class="mini" data-aitw="swap" title="สลับสีพื้นกับสีลาย">⇄ สลับสี</button>
            <button class="mini" data-aitw="turn" title="หมุนลาย 45°">↻ 45°</button>
          </div>
        </div>
      </div>
      <div class="btnrow">
        <button class="mini" id="patUp" title="อัปโหลดลาย (คลิปเข้าทรงเสื้อ)">⬆ อัปโหลดลาย</button>
        <button class="mini" id="patClr" title="ล้างลาย">✕ ล้างลาย</button>
      </div>
      <div class="row" style="margin-top:8px;display:flex;align-items:center;gap:8px"><label style="min-width:52px;font-size:11.5px;color:var(--muted)">ขนาดลาย</label><input type="range" id="patSize" min="0.4" max="2.4" step="0.1" value="1" style="flex:1"><span id="patSizeV" style="min-width:28px;font-size:11px;color:var(--muted)">1.0×</span></div>
      <label style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);margin:2px 0 6px"><input type="checkbox" id="patBrand"> ใช้สีแบรนด์ (ตามสีตัวเสื้อ/ขลิบ)</label>
      <div class="row" style="margin:0 0 6px;gap:6px" title="เปลี่ยนสีลายสำเร็จรูป: สีเข้ม → สีอ่อน (ลายที่มีหลายสีจะไล่ระหว่างสองสีนี้)">
        <label style="display:flex;align-items:center;gap:6px;min-width:0;font-size:11.5px;color:var(--muted)"><input type="checkbox" id="patOwn"> สีลายเอง</label>
        <input type="color" id="patC1" value="#e0a800" style="width:34px;height:26px;border:0;background:none;padding:0" title="สีเข้ม">
        <input type="color" id="patC2" value="#fff35c" style="width:34px;height:26px;border:0;background:none;padding:0" title="สีอ่อน">
      </div>
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
        <button class="mini" id="btnEyedrop" title="ดูดสี (Eyedropper): คลิกวัตถุอื่นเพื่อคัดลอกสีพื้น เส้นขอบ และไล่สีมาใส่ชิ้นที่เลือก">💧 ดูดสี</button>
        <input type="color" id="swPick" style="width:38px;height:32px;border:0;background:none;padding:0" title="เลือกสีเอง">
      </div>
      <div class="swatches" id="swGrid"></div>
      <div class="swcode" id="swCode"></div>
      <div class="row" style="margin:8px 0 0;gap:4px" title="ใส่ค่า CMYK เอง (0–100) — โรงงานพิมพ์ค่านี้ตรงๆ บนจอแสดงตามค่าสีของโรงงาน">
        <label style="min-width:36px">CMYK</label>
        <input type="number" class="ck" id="ckC" min="0" max="100" step="0.5" placeholder="C">
        <input type="number" class="ck" id="ckM" min="0" max="100" step="0.5" placeholder="M">
        <input type="number" class="ck" id="ckY" min="0" max="100" step="0.5" placeholder="Y">
        <input type="number" class="ck" id="ckK" min="0" max="100" step="0.5" placeholder="K">
        <button class="mini" id="ckApply" style="flex:none;min-width:0;padding:6px 8px">ใช้</button>
      </div>
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
        <button class="mini" id="btnClipMake" title="Clipping Mask (Ctrl+7): ชิ้นบนสุดเป็นกรอบ ชิ้นที่อยู่ใต้มันแสดงเฉพาะในกรอบ — เช่น ลาย/รูปในตัวเบอร์">◩ Clip</button>
        <button class="mini" id="btnClipRelease" title="ยกเลิก Clipping Mask (Ctrl+Alt+7)">◪ Release</button>
        <button class="mini danger" id="btnDel" title="ลบ (Del)">🗑 ลบ</button>
      </div>
      <div class="layers" id="layersList"></div>
      <div class="empty" id="layersEmpty">ยังไม่มีวัตถุ</div>
    </div>
  </div>
`;

/* Fabric splits text into characters with no regard for marks: a Thai upper vowel and tone
   mark became letters of their own, so letter spacing pushed them off their consonant (ที่นี่
   showed and printed without its tone marks) and the cursor stopped inside a syllable.
   A letter and its marks are one character here. */
function keepMarksOnLetters() {
  const split = fabric.util.string.graphemeSplit;
  fabric.util.string.graphemeSplit = function (text) {
    const out = [];
    for (const g of split.call(this, text)) {
      if (out.length && /^\p{M}+$/u.test(g) && out[out.length - 1] !== "\n") out[out.length - 1] += g;
      else out.push(g);
    }
    return out;
  };
}

/* ---------- canvas init ---------- */
function initCanvas() {
  keepMarksOnLetters();
  // selection handles in the Axiom accent, readable on the dark stage
  fabric.Object.prototype.set({
    borderColor: "#f26522", cornerColor: "#f26522", cornerStrokeColor: "#0d0e10",
    transparentCorners: false, cornerStyle: "circle", cornerSize: 11, borderScaleFactor: 1.5,
  });
  canvas = new fabric.Canvas("c", {
    backgroundColor: "transparent",
    selectionColor: "rgba(242,101,34,0.08)",
    selectionBorderColor: "#f26522",
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
let sideB = null;          // an R-bib's inside, when it differs: { color, pat }
let bodySide = "both";     // where the colour / pattern pickers go: "both" | "A" | "B"

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
// the pieces sit centred on (200, 235) in a 400×470 frame; one wider than that (XXL, with its cut line)
// widens the frame evenly, so the centre stays put and fabric's group cache doesn't cut the edges off
function svgFrame(bodyD) {
  const bb = pathBBox(bodyD), m = cutMm / MM_PER_UNIT + 2;
  const hw = bb ? Math.max(200, 200 - bb.x + m, bb.x + bb.w - 200 + m) : 200;
  const hh = bb ? Math.max(235, 235 - bb.y + m, bb.y + bb.h - 235 + m) : 235;
  return { x: 200 - hw, y: 235 - hh, w: 2 * hw, h: 2 * hh };
}
const svgHead = f => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f.x} ${f.y} ${f.w} ${f.h}" width="${f.w}" height="${f.h}">`;
// BODY layer — the shirt fill/pattern (sits BELOW user objects; also used as the clip shape)
function garmentSVG(tpl, inside) {
  const sz = window.AXIOM_SIZES && window.AXIOM_SIZES[TPL_SIZE];
  const bodyD = sz ? (tpl === "front" ? sz.front : sz.back) : TPL[tpl];
  const cid = "clip" + Math.random().toString(36).slice(2);
  const own = inside && sideB && curStyle === 2 ? sideB : null;
  const color = own ? own.color : bodyColor, src = own ? own.pat : bodyPatternSrc;
  const base = `<path d="${bodyD}" fill="${color}"/>`;
  const f = svgFrame(bodyD);
  const pat = src ? `<g clip-path="url(#${cid})"><image href="${src}" xlink:href="${src}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="xMidYMid slice"/></g>` : "";
  return `${svgHead(f)}<defs><clipPath id="${cid}"><path d="${bodyD}"/></clipPath></defs>${base}${pat}</svg>`;
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
  // S–XL: the trim drawn as filled shapes; XXL: strokes along the cut line {zone, d, w}, clipped to it like the print file
  const strokes = Array.isArray(trimD) ? trimD : null;
  const band = z => strokes.filter(t => t.zone === z).map(t => `<path d="${t.d}" fill="none" stroke="${trimColor}" stroke-width="${t.w}" stroke-linejoin="round"/>`).join("");
  const parts = strokes || !(hasNeck || hasArm) ? { neck: "", arms: "" } : splitTrim(trimD);
  const trimNeck = !hasNeck ? "" : strokes ? band("neck") : parts.neck ? `<path d="${parts.neck}" fill="${trimColor}"/>` : "";
  const trimArm = !hasArm ? "" : strokes ? band("arm") : parts.arms ? `<path d="${parts.arms}" fill="${trimColor}"/>` : "";
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
  return `${svgHead(svgFrame(bodyD))}<defs><clipPath id="${cid}"><path d="${bodyD}"/></clipPath></defs><g clip-path="url(#${cid})">${trimSVG}${hemSVG}</g>${outline}${cut}${sizeLbl}</svg>`;
}
let garmentGen = 0;
function placeGarment(p) {
  const gen = garmentGen;
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
  fabric.loadSVGFromString(garmentSVG(p.tpl, String(p.id).startsWith("inner")), (objs, opts) => {
    if (!objs || !objs.length || gen !== garmentGen) return;
    const g = fabric.util.groupSVGElements(objs, opts); setup(g);
    g._bg = true; bgObjects.push(g); panelGroups[idx] = g; canvas.add(g); fixBackOrder(); canvas.requestRenderAll();
    // an AI pattern on this piece: inside it, now that its shape is here
    userObjects().filter(o => o._aiPattern && o._aiPanel === p.id).forEach(applyClip);
  });
  fabric.loadSVGFromString(garmentOverlaySVG(p.tpl), (objs, opts) => {
    if (!objs || !objs.length || gen !== garmentGen) return;
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
  garmentGen++; // garments still loading from an earlier rebuild are dropped
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
/* ---------- notifications ----------
   A warning that the factory file will be wrong must not disappear as fast as
   "saved ✓". Warnings and errors stay on screen until dismissed; successes
   fade. Repeats stack a counter instead of flooding the corner.            */
const TOAST_STYLE = {
  ok:   { icon: "✓", ms: 2200 },
  info: { icon: "•", ms: 2800 },
  warn: { icon: "⚠", ms: 0 },   // 0 = stays until closed
  err:  { icon: "✕", ms: 0 },
};
const MAX_TOASTS = 4;

/** toast("saved") · toast("bad thing", "warn") · toast("x", "info", 5000) */
function toast(msg, type, ms) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const kind = TOAST_STYLE[type] ? type : "ok";
  const conf = TOAST_STYLE[kind];
  const text = String(msg ?? "");

  // same message again → bump the counter, don't stack duplicates
  const twin = [...box.children].find(el => el._msg === text && el._kind === kind);
  if (twin) {
    twin._count = (twin._count || 1) + 1;
    let n = twin.querySelector(".n");
    if (!n) { n = document.createElement("span"); n.className = "n"; twin.insertBefore(n, twin.querySelector(".x")); }
    n.textContent = "×" + twin._count;
    restartToastTimer(twin, ms ?? conf.ms);
    return twin;
  }

  const el = document.createElement("div");
  el.className = `tst ${kind}`;
  el._msg = text; el._kind = kind; el._count = 1;
  el.innerHTML = `<span class="ic">${conf.icon}</span><span class="msg"></span><button class="x" title="ปิด">×</button>`;
  el.querySelector(".msg").textContent = text;      // textContent: never inject markup
  el.querySelector(".x").onclick = () => dismissToast(el);

  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("on"));

  // keep the stack short — drop the oldest dismissible one
  while (box.children.length > MAX_TOASTS) {
    const victim = [...box.children].find(c => c._kind === "ok" || c._kind === "info") || box.firstElementChild;
    dismissToast(victim);
  }

  restartToastTimer(el, ms ?? conf.ms);
  return el;
}

function restartToastTimer(el, ms) {
  clearTimeout(el._t);
  if (ms > 0) el._t = setTimeout(() => dismissToast(el), ms);
}

function dismissToast(el) {
  if (!el || el._gone) return;
  el._gone = true;
  clearTimeout(el._t);
  el.classList.remove("on");
  setTimeout(() => el.remove(), 220);
}

/** clear every warning of a given prefix — used before re-running an export */
function clearToasts(kind) {
  const box = document.getElementById("toasts");
  if (!box) return;
  [...box.children].filter(c => !kind || c._kind === kind).forEach(dismissToast);
}
// _wm = preview watermark: never part of the document, never exported
function userObjects() { return canvas.getObjects().filter(o => !o._bg && !o._temp && !o._wm); }
function hint(msg) { $("#hint").textContent = msg || ""; }

/* ---------- history (undo/redo) ---------- */
// undo keeps what a saved design keeps: a warp's or a path's text, a clip group, an AI pattern
function serialize() { return JSON.stringify(userObjects().map(o => o.toObject(ARC_PROPS))); }
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
  fabric.util.enlivenObjects(arr, objs => { objs.forEach(o => { lockAi(o); canvas.add(o); }); fixBackOrder(); restoring = false; canvas.requestRenderAll(); refreshLayers(); syncProps(); }, "fabric");
}
function undo() { if (hIndex > 0) { hIndex--; restore(history[hIndex]); } }
function redo() { if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); } }
$("#btnUndo").onclick = undo;
$("#btnRedo").onclick = redo;

/* ---------- tool switching ---------- */
const cursors = { gradient: "crosshair", select: "default", node: "default", pen: "crosshair", rect: "crosshair", ellipse: "crosshair", poly: "crosshair", line: "crosshair", text: "text", image: "copy", hand: "grab" };
function setTool(name) {
  if (name === "image") { importMode = null; $("#fileImg").click(); return; }
  if (name === "gradient") {
    gradToolFor = gradTarget();
    if (!gradToolFor) { toast("เลือกรูปทรงหรือข้อความ 1 ชิ้นก่อน แล้วกด G", "info"); return; }
  } else gradToolFor = null;
  curTool = name;
  document.querySelectorAll(".tool").forEach(b => b.classList.toggle("on", b.dataset.tool === name));
  const drawing = ["rect", "ellipse", "poly", "line", "pen", "text", "hand"].includes(name);
  canvas.selection = name === "select";
  userObjects().forEach(o => { const on = (name === "select" || name === "node") && !o.lockMovementX; o.selectable = on; o.evented = on; });
  canvas.defaultCursor = cursors[name] || "default";
  canvas.setCursor(cursors[name] || "default");
  if (name !== "node") clearNodeHandles();
  if (name !== "pen") cancelPen();
  if (name === "node") startNodeEdit();
  canvas.requestRenderAll();
  hint(HINTS[name] || "");
}
const HINTS = {
  select: "ลากเลือก/ย้าย (จับเส้นกึ่งกลางตัวเสื้อ/ขอบชิ้นอื่นให้เอง) · ลูกศร 1 มม. Shift 10 มม. · Ctrl+F/B วางซ้อนหน้า/หลังที่เดิม · Ctrl+2 ล็อก · Ctrl+3 ซ่อน · Ctrl+7 Clip · ลากจากไม้บรรทัด = เส้นไกด์ (Ctrl+R ไม้บรรทัด, Ctrl+; ไกด์)",
  node: "เลือกเส้น/รูปที่วาดด้วยปากกา แล้วลากจุด (◯) และแกน (▫) เพื่อดัด",
  pen: "คลิกวางจุด · คลิกค้างแล้วลาก = จุดโค้ง · คลิกจุดแรกเพื่อปิด · Enter จบ · Esc ยกเลิก",
  rect: "ลากเพื่อวาดสี่เหลี่ยม", ellipse: "ลากเพื่อวาดวงกลม/วงรี", poly: "ลากเพื่อวาดรูปหลายเหลี่ยม",
  gradient: "ลากบนชิ้นที่เลือก: จุดเริ่ม → จุดจบของไล่สี (วงกลม: จากจุดกลางออกไป) · Shift = ล็อกมุม 45°",
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
    if (curTool === "gradient") { gradDragStart(p); return; }
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
    if (curTool === "gradient") { gradDragMove(p, e.shiftKey); return; }
    if (curTool === "pen") { penMove(p); return; }
    if (drawing && tempObj) {
      canvas.remove(tempObj);
      tempObj = newShapeFromDrag(curTool, startPt, p);
      canvas.add(tempObj); canvas.requestRenderAll();
    }
  });

  canvas.on("mouse:up", opt => {
    if (curTool === "gradient" && gradDrag) { gradDragEnd(canvas.getPointer(opt.e), opt.e.shiftKey); return; }
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
    ? new fabric.Circle({ left: x, top: y, radius: 5, originX: "center", originY: "center", fill: "#fff", stroke: "#f26522", strokeWidth: 2 })
    : new fabric.Rect({ left: x, top: y, width: 8, height: 8, originX: "center", originY: "center", fill: "#ffc3a3", stroke: "#f26522", strokeWidth: 1 });
  o.set({ selectable: false, evented: false, excludeFromExport: true }); o._temp = true; return o;
}
function renderPen(mouse) {
  clearPenTemp();
  let pts = penPts;
  if (mouse && !penDragging && penPts.length >= 1) pts = penPts.concat([{ x: mouse.x, y: mouse.y, hIn: null, hOut: null }]);
  const d = penD(pts, false);
  if (d) {
    const prev = new fabric.Path(d, { fill: "", stroke: "#f26522", strokeWidth: 1.5, strokeDashArray: [5, 4], selectable: false, evented: false, excludeFromExport: true, strokeUniform: true });
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
      ? new fabric.Circle({ radius: 6, fill: "#fff", stroke: "#f26522", strokeWidth: 2 })
      : new fabric.Rect({ width: 9, height: 9, fill: "#ffc3a3", stroke: "#f26522", strokeWidth: 1 });
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
/* Smart Guides, as Illustrator's: the object's edges and middle snap to each garment
   piece's centre line (a number or a name centred on the back) and to the other
   objects' edges and middles, with the line shown while it holds. */
function snapMove(opt) {
  const o = opt.target; if (!o || o._temp || o._bg) return;
  guides = [];
  const th = 6 / canvas.getZoom();
  const inSel = o._objects || [];
  const xs = [], ys = [];
  panels.forEach(p => { if (p.angle) ys.push(p.cy); else xs.push(p.cx); });
  if (guidesShown) userGuides.forEach(q => (q.axis === "x" ? xs : ys).push(q.v));
  userObjects().forEach(u => {
    if (u === o || inSel.includes(u) || u.visible === false) return;
    const b = u.getBoundingRect(true, true);
    xs.push(b.left, b.left + b.width / 2, b.left + b.width); ys.push(b.top, b.top + b.height / 2, b.top + b.height);
  });
  const b = o.getBoundingRect(true, true);
  const best = (mine, lines) => {
    let d = null, at = null;
    for (const m of mine) for (const t of lines) if (Math.abs(t - m) < th && (d === null || Math.abs(t - m) < Math.abs(d))) { d = t - m; at = t; }
    return { d, at };
  };
  const bx = best([b.left, b.left + b.width / 2, b.left + b.width], xs);
  const by = best([b.top, b.top + b.height / 2, b.top + b.height], ys);
  if (bx.d !== null) { o.set("left", o.left + bx.d); guides.push({ x: bx.at, vert: true }); }
  if (by.d !== null) { o.set("top", o.top + by.d); guides.push({ y: by.at, vert: false }); }
  if (bx.d !== null || by.d !== null) o.setCoords();
}
canvas ? null : 0;
function bindExtra() {
  setTimeout(bindRulers, 0);
  canvas.on("mouse:up", () => { if (curTool === "pen") penDragging = false; });
  canvas.on("object:moving", opt => snapMove(opt));
  canvas.on("mouse:up", () => { if (guides.length) { guides = []; canvas.requestRenderAll(); } });
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
function garmentCode(id, c) {
  const h = String(c).toLowerCase(), i = PALINFO.find(p => p.c.toLowerCase() === h), own = customInks[h];
  const el = document.getElementById(id); if (el) el.textContent = own ? `CMYK ที่ใส่เอง: ${cmykText(own)}` : i ? i.k : c;
  // the CMYK boxes under it show what prints
  const pre = id === "bodyCode" ? "body" : "trim", v = own || (i && parseCmykText(i.k));
  document.querySelectorAll(`[data-ck="${pre}"]`).forEach((b, j) => { if (document.activeElement !== b) b.value = v ? v[j] : ""; });
}
// the garment's own CMYK boxes (body, trim): the colour prints exactly that CMYK
document.querySelectorAll("[data-ckapply]").forEach(btn => {
  const pre = btn.dataset.ckapply, boxes = [...document.querySelectorAll(`[data-ck="${pre}"]`)];
  const go = () => {
    const c = boxes.map(b => { const v = parseFloat(b.value); return isNaN(v) ? 0 : Math.round(Math.min(100, Math.max(0, v)) * 10) / 10; });
    const h = inkHex(c);
    if (pre === "body") setBodyColor(h); else setTrimColor(h);
    pushHistory();
  };
  btn.onclick = go;
  boxes.forEach(b => b.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } }));
});
/** before side A changes alone, side B keeps what it showed */
function splitSides() { if (!sideB) sideB = { color: bodyColor, pat: bodyPatternSrc }; }
function setBodyColor(c) {
  if (bodySide === "B" && curStyle === 2) { splitSides(); sideB.color = c; sideB.pat = null; }
  else { if (bodySide === "A" && curStyle === 2) splitSides(); else sideB = null; bodyColor = c; bodyPattern = null; bodyPatternSrc = null; }
  applyGarment(); garmentCode("bodyCode", c);
}
/** a pattern picture on the side chosen (null: none) */
function setPattern(src) {
  if (bodySide === "B" && curStyle === 2) { splitSides(); sideB.pat = src; }
  else { if (bodySide === "A" && curStyle === 2) splitSides(); else sideB = null; bodyPatternSrc = src; bodyPattern = null; }
  applyGarment();
}
function showBodySide() {
  if (typeof aiShowTweak === "function") setTimeout(aiShowTweak, 0);
  const row = document.getElementById("sideRow"); if (!row) return;
  row.style.display = curStyle === 2 ? "flex" : "none";
  document.querySelectorAll("[data-bside]").forEach(b => b.classList.toggle("on", b.dataset.bside === bodySide));
  garmentCode("bodyCode", bodySide === "B" && sideB ? sideB.color : bodyColor);
}
document.querySelectorAll("[data-bside]").forEach(b => b.onclick = () => { bodySide = b.dataset.bside; showBodySide(); });
function setTrimColor(c) { trimColor = c; applyGarment(); garmentCode("trimCode", c); }
function buildGarmentGrid(gridId, fn) {
  const g = document.getElementById(gridId); if (!g) return; g.innerHTML = "";
  PALETTE.forEach(hex => { const d = document.createElement("div"); d.className = "sw"; d.style.background = hex; d.title = hex; d.onclick = () => fn(hex); g.appendChild(d); });
}
const bodyPickEl = document.getElementById("bodyPick"); if (bodyPickEl) bodyPickEl.oninput = e => setBodyColor(e.target.value);
const trimPickEl = document.getElementById("trimPick"); if (trimPickEl) trimPickEl.oninput = e => setTrimColor(e.target.value);
const bodyWhiteEl = document.getElementById("bodyWhite"); if (bodyWhiteEl) bodyWhiteEl.onclick = () => setBodyColor("#ffffff");
$("#patUp").onclick = () => document.getElementById("filePat").click();
$("#patClr").onclick = () => { lastPat = null; setPattern(null); aiTargets().forEach(i => aiOnPanel(i).forEach(o => canvas.remove(o))); canvas.requestRenderAll(); refreshLayers(); aiShowTweak(); toast("ล้างลายแล้ว"); };
document.getElementById("filePat").addEventListener("change", ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { setPattern(r.result); toast("ใส่ลายเต็มตัวแล้ว"); };
  r.readAsDataURL(f); ev.target.value = "";
});

/* ---------- apply color ---------- */
function showCode(color) {
  const h = String(color).toLowerCase(), info = PALINFO.find(p => p.c.toLowerCase() === h), own = customInks[h];
  $("#swCode").textContent = own ? `CMYK ที่ใส่เอง: ${cmykText(own)}` : info ? `${info.n || ""} ${info.k}`.trim()
    : color === "none" || color === "rgba(0,0,0,0)" ? "ไม่มีสี" : /^#[0-9a-f]{6}$/.test(h) ? `${h} · นอกชาร์ต (โรงงานแปลงเป็น CMYK ให้)` : "";
  const c = own || (info && parseCmykText(info.k));
  ["ckC", "ckM", "ckY", "ckK"].forEach((id, i) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = c ? c[i] : ""; });
}
function applyColor(color) {
  if (fillTarget === "fill" && color !== "none" && gradColor(color)) return;
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
/** sizes typed in mm, as printed; with the lock on, the other side follows (Illustrator's constrain proportions) */
function setSizeMm(o, axis, mm) {
  if (!(mm > 0)) return;
  const c = o.getCenterPoint(), u = mm / MM_PER_UNIT;
  const k = axis === "x" ? u / o.getScaledWidth() : u / o.getScaledHeight();
  if ($("#tLock").checked) o.set({ scaleX: o.scaleX * k, scaleY: o.scaleY * k });
  else if (axis === "x") o.set({ scaleX: o.scaleX * k }); else o.set({ scaleY: o.scaleY * k });
  o.setPositionByOrigin(c, "center", "center"); o.setCoords();
  if (clipOn) (o._objects || [o]).forEach(applyClip);
  canvas.requestRenderAll(); syncProps(); pushHistory();
}
$("#tW").onchange = e => { const o = canvas.getActiveObject(); if (o) setSizeMm(o, "x", +e.target.value); };
$("#tH").onchange = e => { const o = canvas.getActiveObject(); if (o) setSizeMm(o, "y", +e.target.value); };
/** an object's centre in mm on its piece, from the piece's top-left (what the print measures) */
function invM(m) { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; }
function centreMm(o) { const p = panels[panelOf(o)], c = o.getCenterPoint(); return p ? applyM(panelToMm(p), c.x, c.y) : [c.x * MM_PER_UNIT, c.y * MM_PER_UNIT]; }
function setCentreMm(o, x, y) {
  const p = panels[panelOf(o)]; if (!p) return;
  const [cx, cy] = applyM(invM(panelToMm(p)), x, y);
  const was = o.getCenterPoint();
  moveBy(o, cx - was.x, cy - was.y);
  canvas.requestRenderAll(); syncProps(); pushHistory();
}
$("#tX").onchange = e => { const o = canvas.getActiveObject(); if (o && e.target.value !== "") setCentreMm(o, +e.target.value, centreMm(o)[1]); };
$("#tY").onchange = e => { const o = canvas.getActiveObject(); if (o && e.target.value !== "") setCentreMm(o, centreMm(o)[0], +e.target.value); };
$("#tR").onchange = e => { const o = canvas.getActiveObject(); if (!o) return; o.rotate(+e.target.value || 0); canvas.requestRenderAll(); pushHistory(); };

function syncProps() {
  renderGradPanel();
  const o = canvas.getActiveObject();
  const fs = document.getElementById("fontSel");
  const textish = o && isTextish(o);
  // the font row stays visible even with nothing selected: it also sets the
  // font used for the NEXT text you create, and it holds the import button
  if (textish && fs) {
    const fam = isArc(o) ? arcMetaOf(o).fontFamily : o.fontFamily;
    const m = /^"?([^",]+)/.exec(fam || "");
    fs.value = (m && FONTS.includes(m[1])) ? m[1] : curFont;
  } else if (fs) {
    fs.value = curFont;
  }

  // text panel (size / bold / spacing / curve)
  const tr = document.getElementById("textRow");
  if (tr) {
    tr.style.display = textish ? "" : "none";
    if (textish) {
      const m = arcMetaOf(o);
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const lbl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set("txSize", Math.round(m.fontSize));
      set("txSpace", m.charSpacing || 0); lbl("txSpaceV", m.charSpacing || 0);
      set("txArc", m.curve || 0); lbl("txArcV", m.curve || 0);
      const w = m.warp && m.warp.style !== "none" ? m.warp : null;
      set("txWarp", w ? w.style : "none");
      set("txBend", w ? w.bend : 50); lbl("txBendV", w ? w.bend : 50);
      const br = document.getElementById("txBendRow"); if (br) br.style.display = w ? "flex" : "none";
      const pr = document.getElementById("txPathRow"); if (pr) pr.style.display = m.onPath ? "flex" : "none";
      if (m.onPath) set("txPathOff", m.onPath.shift || 0);
      set("txText", m.text);
      const er = document.getElementById("txEditRow");
      if (er) er.style.display = isArc(o) ? "flex" : "none"; // arcs can't be double-click edited
    }
  }
  if (!o) { $("#fillChip").style.background = "transparent"; $("#strokeChip").style.background = "transparent"; $("#swVal").textContent = "0"; $("#swRange").value = 0; $("#opRange").value = 100; $("#opVal").textContent = "100"; $("#tW").value = ""; $("#tH").value = ""; $("#tR").value = ""; $("#tX").value = ""; $("#tY").value = ""; return; }
  const first = o._objects ? o._objects[0] : o;
  $("#fillChip").style.background = isGrad(first.fill) ? gradCss(first.fill) : (first.fill || "transparent");
  { const g = isGrad(first.fill) && fillTarget === "fill" ? sortedStops(first.fill)[Math.min(gradStop, first.fill.colorStops.length - 1)].color : null;
    const cur = g || (fillTarget === "fill" ? first.fill : first.stroke); if (typeof cur === "string") showCode(cur); }
  $("#strokeChip").style.background = first.stroke || "transparent";
  $("#swRange").value = first.strokeWidth || 0; $("#swVal").textContent = first.strokeWidth || 0;
  showJoin(first.strokeLineJoin);
  $("#opRange").value = Math.round((o.opacity ?? 1) * 100); $("#opVal").textContent = Math.round((o.opacity ?? 1) * 100);
  $("#tW").value = Math.round(o.getScaledWidth() * MM_PER_UNIT); $("#tH").value = Math.round(o.getScaledHeight() * MM_PER_UNIT); $("#tR").value = Math.round(o.angle || 0);
  try { const [x, y] = centreMm(o); $("#tX").value = Math.round(x); $("#tY").value = Math.round(y); } catch (e) { $("#tX").value = ""; $("#tY").value = ""; }
}

/* ---------- gradient, as Illustrator's Gradient panel ---------- */
let gradStop = 0; // the stop the swatches colour
const isGrad = f => !!f && typeof f === "object" && Array.isArray(f.colorStops);
/** the one shape a gradient can go on (not a group, a picture or a curved name) */
function gradTarget() {
  const o = canvas.getActiveObject();
  return o && !o._objects && o.type !== "image" && !isArc(o) ? o : null;
}
const sortedStops = g => g.colorStops.map(s => ({ offset: s.offset, color: colorHex(s.color) || "#000000" })).sort((a, b) => a.offset - b.offset);
const gradCss = g => `linear-gradient(90deg,${sortedStops(g).map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(",")})`;
function gradAngle(g) { const c = g.coords; return Math.round(Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180 / Math.PI); }
/**
 * A gradient across the object (Illustrator's default: through the middle, at
 * an angle; a radial one round from the middle). In the object's own units, not
 * as fractions of its box: a text's box is wider than its letters, and the
 * print draws the letters' outlines, so a fraction would land elsewhere.
 */
function makeGrad(o, type, stops, angle) {
  const w = o.width || 1, h = o.height || 1;
  // the same kind at the same angle keeps where it was put (dragged with the Gradient tool)
  const was = o.fill;
  const keep = isGrad(was) && was.type === type && (type === "radial" || gradAngle(was) === Math.round(angle || 0)) ? { ...was.coords } : null;
  const a = (angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const half = (Math.abs(w * ca) + Math.abs(h * sa)) / 2; // reaches the box's corners along the angle
  return new fabric.Gradient({
    type, gradientUnits: "pixels",
    coords: keep || (type === "linear"
      ? { x1: w / 2 - ca * half, y1: h / 2 - sa * half, x2: w / 2 + ca * half, y2: h / 2 + sa * half }
      : { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 }),
    colorStops: stops.slice().sort((p, q) => p.offset - q.offset).map(t => ({ offset: Math.min(1, Math.max(0, t.offset)), color: t.color })),
  });
}
function setGrad(o, g, record = true) { o.set("fill", g); o.dirty = true; canvas.requestRenderAll(); renderGradPanel(); if (record) pushHistory(); }
/** a swatch picked while a gradient is selected colours its selected stop; false when there's no gradient */
function gradColor(color) {
  const o = gradTarget(), g = o && o.fill;
  if (!isGrad(g)) return false;
  const st = sortedStops(g); st[Math.min(gradStop, st.length - 1)].color = color;
  setGrad(o, makeGrad(o, g.type, st, gradAngle(g)));
  showCode(color); syncProps();
  return true;
}
function renderGradPanel() {
  const panel = document.getElementById("gradPanel"); if (!panel) return;
  const o = gradTarget(), g = o && isGrad(o.fill) ? o.fill : null;
  panel.style.opacity = o ? "" : ".55";
  document.querySelectorAll("[data-gtype]").forEach(b => b.classList.toggle("on", !!o && (g ? g.type : "none") === b.dataset.gtype));
  $("#gradEdit").style.display = g ? "" : "none";
  if (!g) return;
  const st = sortedStops(g); gradStop = Math.min(gradStop, st.length - 1);
  const bar = $("#gradBar");
  bar.style.background = gradCss(g);
  bar.innerHTML = "";
  st.forEach((s, i) => {
    const m = document.createElement("div");
    m.className = "gstop" + (i === gradStop ? " on" : ""); m.style.left = (s.offset * 100) + "%"; m.style.background = s.color;
    m.title = `${s.color} · ${Math.round(s.offset * 100)}%`;
    m.onpointerdown = ev => {
      ev.stopPropagation(); ev.preventDefault();
      gradStop = i; renderGradPanel();
      const r = bar.getBoundingClientRect(); let moved = false;
      const move = e2 => {
        moved = true;
        const now = sortedStops(o.fill), me = now[gradStop];
        me.offset = Math.min(1, Math.max(0, (e2.clientX - r.left) / r.width));
        const ordered = now.slice().sort((p, q) => p.offset - q.offset); gradStop = ordered.indexOf(me);
        setGrad(o, makeGrad(o, g.type, ordered, gradAngle(o.fill)), false);
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (moved) pushHistory(); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    bar.appendChild(m);
  });
  $("#gAngle").value = gradAngle(g); $("#gAngle").disabled = g.type !== "linear";
  $("#gPos").value = Math.round(st[gradStop].offset * 100); $("#gPosV").textContent = Math.round(st[gradStop].offset * 100) + "%";
  $("#gDel").disabled = st.length <= 2;
}
document.querySelectorAll("[data-gtype]").forEach(b => b.onclick = () => {
  const o = gradTarget(); if (!o) { toast("เลือกรูปทรงหรือข้อความก่อน", "info"); return; }
  const t = b.dataset.gtype, f = o.fill;
  if (t === "none") { if (isGrad(f)) { o.set("fill", sortedStops(f)[0].color); canvas.requestRenderAll(); pushHistory(); syncProps(); } return; }
  // Illustrator's default for a flat colour: the colour fading to black
  const stops = isGrad(f) ? sortedStops(f) : [{ offset: 0, color: colorHex(f) || "#ffffff" }, { offset: 1, color: "#231f20" }];
  gradStop = 0;
  setGrad(o, makeGrad(o, t, stops, isGrad(f) && f.type === "linear" ? gradAngle(f) : 0));
  syncProps();
});
$("#gradBar").onpointerdown = ev => {
  const o = gradTarget(); if (!o || !isGrad(o.fill) || ev.target !== ev.currentTarget) return;
  const r = ev.currentTarget.getBoundingClientRect(), at = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  const st = sortedStops(o.fill);
  // the colour already there, as Illustrator adds a stop
  const i = Math.max(1, st.findIndex(s => s.offset >= at)), a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i)];
  const k = b.offset > a.offset ? (at - a.offset) / (b.offset - a.offset) : 0;
  const ca = new fabric.Color(a.color).getSource(), cb = new fabric.Color(b.color).getSource();
  const color = "#" + [0, 1, 2].map(j => Math.round(ca[j] + (cb[j] - ca[j]) * k).toString(16).padStart(2, "0")).join("");
  const me = { offset: at, color };
  const ordered = st.concat(me).sort((p, q) => p.offset - q.offset); gradStop = ordered.indexOf(me);
  setGrad(o, makeGrad(o, o.fill.type, ordered, gradAngle(o.fill)));
};
$("#gAngle").onchange = e => { const o = gradTarget(); if (o && isGrad(o.fill) && o.fill.type === "linear") setGrad(o, makeGrad(o, "linear", sortedStops(o.fill), +e.target.value || 0)); };
$("#gPos").oninput = e => {
  const o = gradTarget(); if (!o || !isGrad(o.fill)) return;
  const st = sortedStops(o.fill), me = st[gradStop]; me.offset = (+e.target.value) / 100;
  const ordered = st.sort((p, q) => p.offset - q.offset); gradStop = ordered.indexOf(me);
  setGrad(o, makeGrad(o, o.fill.type, ordered, gradAngle(o.fill)), false);
};
$("#gPos").onchange = () => pushHistory();
$("#gRev").onclick = () => { const o = gradTarget(); if (o && isGrad(o.fill)) setGrad(o, makeGrad(o, o.fill.type, sortedStops(o.fill).map(s => ({ offset: 1 - s.offset, color: s.color })), gradAngle(o.fill))); };
$("#gDel").onclick = () => {
  const o = gradTarget(); if (!o || !isGrad(o.fill)) return;
  const st = sortedStops(o.fill); if (st.length <= 2) return;
  st.splice(gradStop, 1); gradStop = Math.max(0, gradStop - 1);
  setGrad(o, makeGrad(o, o.fill.type, st, gradAngle(o.fill)));
};

/* ---------- the Gradient tool (G): dragged across the object, as in Illustrator ---------- */
let gradToolFor = null, gradDrag = null;
/** a point on the canvas → the object's own gradient units (from its top-left, unscaled) */
function toGradUnits(o, p) {
  const inv = fabric.util.invertTransform(o.calcTransformMatrix());
  const q = fabric.util.transformPoint(new fabric.Point(p.x, p.y), inv);
  return { x: q.x + o.width / 2, y: q.y + o.height / 2 };
}
function snap45(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
function gradDragStart(p) {
  const o = gradToolFor; if (!o || !canvas.getObjects().includes(o)) { setTool("select"); return; }
  const line = new fabric.Line([p.x, p.y, p.x, p.y], { stroke: "#f26522", strokeWidth: 2 / canvas.getZoom(), strokeDashArray: [6 / canvas.getZoom(), 4 / canvas.getZoom()], selectable: false, evented: false, _temp: true, excludeFromExport: true });
  canvas.add(line);
  gradDrag = { a: p, line };
}
function gradDragMove(p, shift) {
  if (!gradDrag) return;
  const b = shift ? snap45(gradDrag.a, p) : p;
  gradDrag.line.set({ x2: b.x, y2: b.y }); canvas.requestRenderAll();
}
function gradDragEnd(p, shift) {
  const { a, line } = gradDrag; gradDrag = null; canvas.remove(line);
  const o = gradToolFor, b = shift ? snap45(a, p) : p;
  if (!o || Math.hypot(b.x - a.x, b.y - a.y) < 3 / canvas.getZoom()) { canvas.requestRenderAll(); return; }
  const f = o.fill;
  const type = isGrad(f) ? f.type : "linear";
  const stops = isGrad(f) ? sortedStops(f) : [{ offset: 0, color: colorHex(f) || "#ffffff" }, { offset: 1, color: "#231f20" }];
  const A = toGradUnits(o, a), B = toGradUnits(o, b);
  const g = new fabric.Gradient({
    type, gradientUnits: "pixels",
    // radial: the drag's start is the centre, its length the radius
    coords: type === "linear" ? { x1: A.x, y1: A.y, x2: B.x, y2: B.y } : { x1: A.x, y1: A.y, r1: 0, x2: A.x, y2: A.y, r2: Math.hypot(B.x - A.x, B.y - A.y) },
    colorStops: stops.map(s => ({ offset: s.offset, color: s.color })),
  });
  o.set("fill", g); o.dirty = true;
  canvas.setActiveObject(o); canvas.requestRenderAll(); renderGradPanel(); syncProps(); pushHistory();
}

/* ---------- Pathfinder (as Illustrator's): shapes combined into one outline, by paper.js ---------- */
let paperReady = null;
function loadPaper() {
  return paperReady || (paperReady = new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.18/paper-core.min.js";
    s.onload = () => { paper.setup(new paper.Size(1, 1)); ok(window.paper); };
    s.onerror = () => { paperReady = null; bad(new Error("paper.js")); };
    document.head.appendChild(s);
  }));
}
/** an object's filled area as one paper.js outline in canvas units (text outlined first); null when it has none */
async function areaOf(o) {
  const keep = o.clipPath; o.clipPath = null;
  let svg; try { svg = o.toSVG(); } finally { o.clipPath = keep; }
  const r = await outlineSVG(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${svg}</svg>`);
  const root = paper.project.importSVG(r.svg, { insert: false, expandShapes: true });
  let area = null;
  const parts = root.getItems({ match: x => (x instanceof paper.Path || x instanceof paper.CompoundPath) && !(x.parent instanceof paper.CompoundPath) });
  for (const c of parts) {
    if (c.clipMask || !c.fillColor || c.fillColor.alpha === 0) continue;
    const p = c.clone({ insert: false });
    p.applyMatrix = true; // its own transform into its points
    if (c.parent) p.transform(c.parent.globalMatrix);
    area = area ? area.unite(p, { insert: false }) : p;
  }
  return area;
}
/** the paint a result takes (Illustrator: the top object's, or the bottom one's for Minus Front) */
function paintOf(o) {
  const src = o._objects ? (o._objects.find(x => x.fill && x.fill !== "rgba(0,0,0,0)") || o._objects[0]) : o;
  return { fill: src.fill, stroke: src.stroke, strokeWidth: src.strokeWidth || 0, opacity: o.opacity ?? 1, paintFirst: src.paintFirst };
}
async function pathfinder(op) {
  const objs = canvas.getActiveObjects().slice();
  if (objs.length < 2) { toast("เลือกอย่างน้อย 2 ชิ้น (Shift+คลิก) ก่อนใช้ Pathfinder", "info"); return; }
  if (objs.some(o => o.type === "image")) { toast("รูปภาพใช้ Pathfinder ไม่ได้ — ใช้กับรูปทรง ข้อความ หรือโลโก้ SVG", "warn"); return; }
  if (objs.some(o => o.rosterTag)) { toast("ชื่อ/เบอร์ที่เปลี่ยนตามรายชื่อ รวมกับชิ้นอื่นไม่ได้", "warn"); return; }
  try { await loadPaper(); } catch (e) { toast("โหลดเครื่องมือ Pathfinder ไม่ได้ — ตรวจอินเทอร์เน็ต", "err"); return; }
  canvas.discardActiveObject(); // each object back in canvas units
  const all = canvas.getObjects();
  const order = objs.sort((a, b) => all.indexOf(a) - all.indexOf(b)); // bottom first
  const areas = [];
  for (const o of order) { const a = await areaOf(o); if (a) areas.push(a); }
  if (areas.length < 2) { toast("ต้องมีรูปทรงที่มีสีพื้นอย่างน้อย 2 ชิ้น", "warn"); return; }
  let res;
  if (op === "unite") res = areas.reduce((a, b) => a.unite(b, { insert: false }));
  else if (op === "minus") res = areas.slice(1).reduce((a, b) => a.subtract(b, { insert: false }), areas[0]);
  else if (op === "intersect") res = areas.reduce((a, b) => a.intersect(b, { insert: false }));
  else res = areas.reduce((a, b) => a.exclude(b, { insert: false }));
  const d = res && res.pathData;
  if (!d || !(Math.abs(res.area) > 0.01)) { toast(op === "intersect" ? "รูปทรงไม่ได้ซ้อนกัน — ไม่มีส่วนที่เหลือ" : "ไม่มีรูปทรงเหลือ", "warn"); return; }
  const from = op === "minus" ? order[0] : order[order.length - 1];
  const paint = paintOf(from);
  const shape = new fabric.Path(d, { fillRule: "evenodd", strokeUniform: false, ...paint, fill: isGrad(paint.fill) ? sortedStops(paint.fill)[0].color : paint.fill });
  if (isGrad(paint.fill)) shape.set("fill", makeGrad(shape, paint.fill.type, sortedStops(paint.fill), gradAngle(paint.fill)));
  const at = all.indexOf(from);
  order.forEach(o => canvas.remove(o));
  canvas.insertAt(shape, Math.min(at - order.filter(o => all.indexOf(o) < at).length, canvas.getObjects().length));
  if (clipOn) applyClip(shape);
  canvas.setActiveObject(shape); canvas.requestRenderAll();
  refreshLayers(); syncProps(); pushHistory();
  toast({ unite: "รวมรูปทรงแล้ว", minus: "เจาะรูปทรงแล้ว", intersect: "เหลือส่วนที่ซ้อนกันแล้ว", exclude: "ตัดส่วนที่ซ้อนกันแล้ว" }[op], "ok");
}
document.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => pathfinder(b.dataset.pf));

/* ---------- stroke corners (Illustrator's Stroke panel: round / miter / bevel) ---------- */
let curJoin = "round";
function showJoin(j) { curJoin = j || "round"; document.querySelectorAll("[data-join]").forEach(b => b.classList.toggle("on", b.dataset.join === curJoin)); }
document.querySelectorAll("[data-join]").forEach(b => b.onclick = () => {
  showJoin(b.dataset.join);
  const objs = canvas.getActiveObjects(); if (!objs.length) return;
  // Illustrator's miter limit: a spike up to 10 × the width, then it is cut
  objs.forEach(o => (o._objects || [o]).forEach(x => x.set({ strokeLineJoin: curJoin, strokeMiterLimit: 10 })));
  canvas.requestRenderAll(); pushHistory();
});

/* ---------- Clipping Mask (Ctrl+7), as Illustrator's: the top object's shape shows only what lies under it ----------
   The masked objects are a group clipped by the mask's shape, inside an outer group that
   takes the garment clip (which every top-level object gets): the two clips never fight.
   The print reads the mask as the artwork's own clip (clip-path in the SVG). */
async function makeClipMask() {
  const sel = canvas.getActiveObject();
  if (!sel || sel.type !== "activeSelection" || sel._objects.length < 2) { toast("เลือก 2 ชิ้นขึ้นไป (Shift+คลิก) — ชิ้นบนสุดจะเป็นกรอบ", "info"); return; }
  const objs = sel._objects.slice();
  if (objs.some(o => o.rosterTag)) { toast("ชื่อ/เบอร์ที่เปลี่ยนตามรายชื่อ ใส่ใน Clipping Mask ไม่ได้", "warn"); return; }
  canvas.discardActiveObject();
  const all = canvas.getObjects();
  objs.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const top = objs.pop(), at = all.indexOf(objs[0]);
  if (top.type === "image") { toast("ชิ้นบนสุดต้องเป็นรูปทรงหรือข้อความ (ใช้เป็นกรอบ)", "warn"); canvas.setActiveObject(new fabric.ActiveSelection(objs.concat(top), { canvas })); return; }
  const mask = await new Promise(ok => top.clone(ok, ARC_PROPS));
  mask.clipPath = null;
  [top, ...objs].forEach(o => canvas.remove(o));
  objs.forEach(o => { o.clipPath = null; });
  const inner = new fabric.Group(objs, { objectCaching: false });
  // the mask in the group's own space (centred on the group)
  const c = inner.getCenterPoint(), mc = mask.getCenterPoint();
  mask.setPositionByOrigin(new fabric.Point(mc.x - c.x, mc.y - c.y), "center", "center");
  mask._maskOf = top.name || objLabel(top);
  inner.clipPath = mask;
  const outer = new fabric.Group([inner], { objectCaching: false });
  outer._clipMask = true; outer.name = "Clip Group";
  canvas.insertAt(outer, Math.max(0, at));
  applyClip(outer);
  canvas.setActiveObject(outer); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
  toast("ทำ Clipping Mask แล้ว — ยกเลิกได้ด้วย ◪ Release (Ctrl+Alt+7)", "ok");
}
function releaseClipMask() {
  const outer = canvas.getActiveObject();
  if (!outer || !outer._clipMask) { toast("เลือก Clip Group ก่อน", "info"); return; }
  const at = canvas.getObjects().indexOf(outer);
  const inner = outer._objects[0];
  const mask = inner.clipPath;
  // the mask back on the canvas where it showed: its place in the inner group, then the groups' own
  const M = fabric.util.multiplyTransformMatrices(inner.calcTransformMatrix(), mask.calcTransformMatrix());
  outer.toActiveSelection(); canvas.discardActiveObject();
  inner.clipPath = null;
  canvas.setActiveObject(inner); inner.toActiveSelection();
  const contents = canvas.getActiveObject()._objects.slice();
  canvas.discardActiveObject();
  fabric.util.applyTransformToObject(mask, M);
  delete mask._maskOf;
  canvas.insertAt(mask, Math.min(canvas.getObjects().length, at + contents.length));
  contents.concat(mask).forEach(o => { o.setCoords(); applyClip(o); });
  canvas.setActiveObject(new fabric.ActiveSelection(contents.concat(mask), { canvas }));
  fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
}
$("#btnClipMake").onclick = () => makeClipMask();
$("#btnClipRelease").onclick = () => releaseClipMask();

/* ---------- Offset Path: an outline round the object, a new layer behind it ---------- */
async function offsetPath() {
  const o = canvas.getActiveObject();
  if (!o || o.type === "activeSelection") { toast("เลือกตัวอักษรหรือรูปทรง 1 ชิ้นก่อน", "info"); return; }
  if (o.type === "image") { toast("รูปภาพทำขอบนอกไม่ได้ — ใช้กับตัวอักษร รูปทรง หรือโลโก้ SVG", "warn"); return; }
  const mm = Math.max(0.5, +$("#offMm").value || 3), u = mm / MM_PER_UNIT;
  // near-black, a ring of its own past any keyline already there; recoloured after, as in Illustrator
  const color = "#231f20";
  const c = await new Promise(ok => o.clone(ok, ["name", "rosterTag", "arcMeta"]));
  const widen = x => {
    const k = x.strokeUniform ? 1 : ((Math.abs(x.scaleX) + Math.abs(x.scaleY)) / 2) * (x.group ? (Math.abs(x.group.scaleX) + Math.abs(x.group.scaleY)) / 2 : 1);
    // a keyline already under the fill reaches half its width out: the new one goes past it
    const had = x.stroke && x.strokeWidth && x.paintFirst === "stroke" ? x.strokeWidth : 0;
    x.set({ fill: isGrad(x.fill) || x.fill ? color : x.fill, stroke: color, strokeWidth: had + (2 * u) / (x.strokeUniform ? 1 : k), strokeLineJoin: curJoin, strokeMiterLimit: 10, paintFirst: "stroke" });
  };
  if (c._objects) c._objects.forEach(widen); else widen(c);
  if (o.rosterTag) c.rosterTag = o.rosterTag; // a name's outline changes with the name
  c.name = (o.name || objLabel(o)) + " · ขอบนอก";
  canvas.insertAt(c, canvas.getObjects().indexOf(o));
  if (clipOn) applyClip(c);
  canvas.setActiveObject(o); canvas.requestRenderAll(); refreshLayers(); pushHistory();
  toast(`เพิ่มขอบนอก ${mm} มม. แล้ว (ชั้นด้านหลัง) — เลือกชั้นนั้นแล้วคลิกสีเพื่อเปลี่ยนสี`, "ok");
}
$("#btnOffset").onclick = () => offsetPath();

/* ---------- eyedropper: the next object clicked gives its paint to the selection ---------- */
let eyedropFor = null, eyedropBound = false;
$("#btnEyedrop").onclick = () => {
  const objs = canvas.getActiveObjects();
  if (!objs.length) { toast("เลือกชิ้นที่จะเปลี่ยนสีก่อน แล้วกดดูดสี", "info"); return; }
  eyedropFor = objs.slice();
  canvas.defaultCursor = canvas.hoverCursor = "crosshair";
  toast("คลิกวัตถุที่ต้องการดูดสี (Esc ยกเลิก)", "info");
  if (eyedropBound) return;
  eyedropBound = true;
  canvas.on("mouse:down", opt => {
    if (!eyedropFor) return;
    const targets = eyedropFor; eyedropFor = null;
    canvas.defaultCursor = "default"; canvas.hoverCursor = "move";
    const t = opt.target, from = t && (t._objects ? t._objects.find(x => x.fill) || t._objects[0] : t);
    const restore = () => { canvas.discardActiveObject(); canvas.setActiveObject(targets.length > 1 ? new fabric.ActiveSelection(targets, { canvas }) : targets[0]); canvas.requestRenderAll(); syncProps(); };
    if (!from || targets.includes(t) || t.type === "image") { restore(); return; }
    const paint = { fill: from.fill, stroke: from.stroke, strokeWidth: from.strokeWidth, paintFirst: from.paintFirst };
    targets.forEach(o => (o._objects || [o]).forEach(x => {
      x.set({ stroke: paint.stroke, strokeWidth: paint.strokeWidth, paintFirst: paint.paintFirst });
      x.set("fill", isGrad(paint.fill) ? makeGrad(x, paint.fill.type, sortedStops(paint.fill), gradAngle(paint.fill)) : paint.fill);
    }));
    restore(); pushHistory();
    toast("ดูดสีแล้ว", "ok");
  });
};
document.addEventListener("keydown", e => { if (e.key === "Escape" && eyedropFor) { eyedropFor = null; canvas.defaultCursor = "default"; canvas.hoverCursor = "move"; } });

/* ---------- CMYK typed in: printed exactly, shown as the factory's Illustrator shows it ---------- */
/** CMYK (0–100) → screen RGB by the factory's table (factory-rgb.js), between its grid points */
function cmykToRgb(c) {
  const T = window.AXIOM_CMYK_RGB;
  if (!T) { const k = 1 - c[3] / 100; return [0, 1, 2].map(i => Math.round(255 * (1 - c[i] / 100) * k)); }
  const n = T.grid.length, step = 100 / (n - 1);
  const at = c.map(v => { const t = Math.min(100, Math.max(0, v)) / step, i = Math.min(n - 2, Math.floor(t)); return [i, t - i]; });
  const out = [0, 0, 0];
  for (let corner = 0; corner < 16; corner++) {
    let w = 1, idx = 0;
    for (let a = 0; a < 4; a++) { const hi = (corner >> (3 - a)) & 1; w *= hi ? at[a][1] : 1 - at[a][1]; idx = idx * n + at[a][0] + hi; }
    if (!w) continue;
    for (let q = 0; q < 3; q++) out[q] += w * T.rgb[idx * 3 + q];
  }
  return out.map(v => Math.min(255, Math.max(0, Math.round(v))));
}
/** every colour the design paints with (fills, strokes, gradient stops, the garment) */
function usedColours() {
  const out = new Set([bodyColor, trimColor, sideB && sideB.color].filter(c => typeof c === "string").map(c => c.toLowerCase()));
  const add = v => { if (typeof v === "string") { const h = colorHex(v); if (h) out.add(h); } else if (isGrad(v)) v.colorStops.forEach(s => add(s.color)); };
  const walk = o => { add(o.fill); add(o.stroke); (o._objects || []).forEach(walk); };
  userObjects().forEach(walk);
  return out;
}
/** the screen colour that stands for a typed CMYK: a chart swatch with that CMYK, else its own (unique) colour */
function inkHex(c) {
  const key = cmykText(c);
  const same = Object.entries(customInks).find(([, v]) => cmykText(v) === key); if (same) return same[0];
  const chart = PALINFO.find(p => p.k === key); if (chart) return chart.c.toLowerCase();
  const rgb = cmykToRgb(c);
  // a colour the chart, another typed ink or the design itself already uses would print as this CMYK too:
  // step it by one so each colour prints its own CMYK (a plain black stays a plain black)
  const used = usedColours();
  const taken = h => PALINFO.some(p => p.c.toLowerCase() === h) || customInks[h] || used.has(h) || h === "#000000" || h === "#ffffff";
  let h, i = 0;
  do {
    const b = Math.min(255, Math.max(0, rgb[2] + (i % 2 ? -1 : 1) * Math.ceil(i / 2)));
    h = "#" + [rgb[0], rgb[1], b].map(v => v.toString(16).padStart(2, "0")).join(""); i++;
  } while (taken(h) && i < 40);
  customInks[h] = c;
  return h;
}
function applyTypedCmyk() {
  const c = ["ckC", "ckM", "ckY", "ckK"].map(id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : Math.round(Math.min(100, Math.max(0, v)) * 10) / 10; });
  applyColor(inkHex(c));
}
$("#ckApply").onclick = applyTypedCmyk;
["ckC", "ckM", "ckY", "ckK"].forEach(id => document.getElementById(id).addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); applyTypedCmyk(); } }));

/* ---------- rulers (mm) and guides, as Illustrator's ----------
   Each garment piece has its own 0 at its top-left, as the print measures (the
   Transform panel's X/Y). Guides are dragged out of a ruler, moved by dragging
   them on the canvas, dropped back on a ruler to delete; objects snap to them. */
let userGuides = [];            // { axis: "x" | "y", v: canvas units }
let guidesShown = true, rulerMouse = null;
const RULER = 18;
/** a piece's mm along a canvas axis: [canvas units → mm] as a + b·v, and the canvas range it covers */
function pieceAxis(p, axis) {
  const m = panelToMm(p);
  const at = v => axis === "x" ? applyM(m, v, p.cy) : applyM(m, p.cx, v);
  const p0 = at(0), p1 = at(1);
  // the mm axis that changes along this canvas axis (a piece laid on its side swaps them)
  const k = Math.abs(p1[0] - p0[0]) > Math.abs(p1[1] - p0[1]) ? 0 : 1;
  return { a: p0[k], b: p1[k] - p0[k], from: axis === "x" ? p.x : p.y, to: axis === "x" ? p.x + p.w : p.y + p.h };
}
function drawRuler(el, axis) {
  const stageR = stage.getBoundingClientRect();
  const len = axis === "x" ? stageR.width - RULER : stageR.height - RULER;
  const dpr = window.devicePixelRatio || 1;
  if (el.width !== Math.round(len * dpr) || el.height !== Math.round(RULER * dpr)) {
    el.width = Math.round((axis === "x" ? len : RULER) * dpr); el.height = Math.round((axis === "x" ? RULER : len) * dpr);
    el.style.width = (axis === "x" ? len : RULER) + "px"; el.style.height = (axis === "x" ? RULER : len) + "px";
  }
  const g = el.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (axis === "y") { g.translate(RULER, 0); g.rotate(Math.PI / 2); } // draw the left one as a top one, turned
  g.fillStyle = "#141619"; g.fillRect(0, 0, len, RULER);
  const vpt = canvas.viewportTransform, k = axis === "x" ? vpt[0] : vpt[3], off = (axis === "x" ? vpt[4] : vpt[5]) - RULER;
  const toScreen = v => v * k + off;
  // which pieces: across, every piece side by side; down, the one under the mouse (else the first)
  let ps = panels.filter(p => p.w && p.h);
  if (axis === "y") { const near = rulerMouse ? ps.find(p => rulerMouse.x >= p.x && rulerMouse.x <= p.x + p.w) : null; ps = [near || ps[0]].filter(Boolean); }
  const pxPerMm = k / MM_PER_UNIT;
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(s => s * pxPerMm >= 42) || 1000;
  const minor = step / (step % 5 === 0 ? 5 : 2);
  g.font = "9px Sora, sans-serif"; g.textBaseline = "top";
  for (const p of ps) {
    const ax = pieceAxis(p, axis);
    const s0 = toScreen(ax.from), s1 = toScreen(ax.to);
    g.fillStyle = "#1d2024"; g.fillRect(Math.min(s0, s1), 0, Math.abs(s1 - s0), RULER);
    const mm0 = ax.a + ax.b * ax.from, mm1 = ax.a + ax.b * ax.to;
    const lo = Math.min(mm0, mm1), hi = Math.max(mm0, mm1);
    for (let mm = Math.ceil(lo / minor) * minor; mm <= hi + 1e-9; mm += minor) {
      const x = toScreen((mm - ax.a) / ax.b);
      if (x < -20 || x > len + 20) continue;
      const major = Math.abs(mm / step - Math.round(mm / step)) < 1e-6;
      g.strokeStyle = major ? "#7d8187" : "#4a4e54"; g.beginPath(); g.moveTo(x + 0.5, major ? 6 : 12); g.lineTo(x + 0.5, RULER); g.stroke();
      if (major) { g.fillStyle = "#a3a6ab"; g.fillText(String(Math.round(mm)), x + 2, 1); }
    }
  }
  // guides and the mouse, marked on the ruler
  g.fillStyle = "#22d3ee";
  userGuides.filter(q => q.axis === axis).forEach(q => { const x = toScreen(q.v); g.fillRect(x - 1, 0, 2, RULER); });
  if (rulerMouse) { g.fillStyle = "#f26522"; const x = toScreen(axis === "x" ? rulerMouse.x : rulerMouse.y); g.fillRect(x - 0.5, 0, 1, RULER); }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function drawRulers() {
  if (document.documentElement.classList.contains("norulers") || isPreview()) return;
  const rx = document.getElementById("rulerX"), ry = document.getElementById("rulerY");
  if (rx && ry) { drawRuler(rx, "x"); drawRuler(ry, "y"); }
}
/** a guide's position in mm on the piece under it, for its label */
function guideMm(q) {
  const p = panels.find(pp => q.axis === "x" ? q.v >= pp.x && q.v <= pp.x + pp.w : q.v >= pp.y && q.v <= pp.y + pp.h) || panels[0];
  if (!p) return "";
  const ax = pieceAxis(p, q.axis);
  return (Math.round((ax.a + ax.b * q.v) * 10) / 10) + " มม.";
}
/** canvas units under a screen point */
function canvasAt(clientX, clientY) {
  const r = canvas.upperCanvasEl.getBoundingClientRect(), vpt = canvas.viewportTransform;
  return { x: (clientX - r.left - vpt[4]) / vpt[0], y: (clientY - r.top - vpt[5]) / vpt[3] };
}
/** a guide on whole mm of its piece (as Illustrator's rulers snap) */
function snapGuide(q) {
  const p = panels.find(pp => q.axis === "x" ? q.v >= pp.x && q.v <= pp.x + pp.w : q.v >= pp.y && q.v <= pp.y + pp.h);
  if (!p) return;
  // the piece's centre line first (where a number or a name goes), else whole mm
  const mid = q.axis === "x" ? p.cx : p.cy;
  if (Math.abs(q.v - mid) < 6 / canvas.getZoom()) { q.v = mid; return; }
  const ax = pieceAxis(p, q.axis), mm = Math.round(ax.a + ax.b * q.v);
  q.v = (mm - ax.a) / ax.b;
}
let guideDrag = null;
function startGuideDrag(q, isNew) {
  guideDrag = { q, isNew };
  canvas.selection = false;
  const move = e => {
    const at = canvasAt(e.clientX, e.clientY);
    q.v = q.axis === "x" ? at.x : at.y; snapGuide(q);
    rulerMouse = at; canvas.requestRenderAll();
  };
  const up = e => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    canvas.selection = curTool === "select";
    // let go over a ruler: no guide
    const r = stage.getBoundingClientRect(), onRuler = e.clientX - r.left < RULER || e.clientY - r.top < RULER;
    if (onRuler) userGuides = userGuides.filter(g => g !== q);
    else if (isNew) userGuides.push(q);
    guideDrag = null; canvas.requestRenderAll();
    if (!onRuler) toast(`ไกด์ ${q.axis === "x" ? "แนวตั้ง" : "แนวนอน"} ที่ ${guideMm(q)}`, "info");
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function bindRulers() {
  const rx = document.getElementById("rulerX"), ry = document.getElementById("rulerY"), corner = document.getElementById("rulerCorner");
  if (!rx || !ry) return;
  // out of the top ruler: a horizontal guide; out of the left one: a vertical guide
  rx.addEventListener("pointerdown", e => { e.preventDefault(); const at = canvasAt(e.clientX, e.clientY); startGuideDrag({ axis: "y", v: at.y }, true); });
  ry.addEventListener("pointerdown", e => { e.preventDefault(); const at = canvasAt(e.clientX, e.clientY); startGuideDrag({ axis: "x", v: at.x }, true); });
  corner.addEventListener("dblclick", () => { userGuides = []; canvas.requestRenderAll(); toast("ลบไกด์ทั้งหมดแล้ว"); });
  // a guide on the canvas, picked up where nothing else is
  canvas.on("mouse:down:before", opt => {
    if (curTool !== "select" || !guidesShown || !userGuides.length || spaceDown) return;
    const p = canvas.getPointer(opt.e), tol = 4 / canvas.getZoom();
    if (canvas.findTarget(opt.e)) return;
    const q = userGuides.find(g => Math.abs((g.axis === "x" ? p.x : p.y) - g.v) < tol);
    if (q) { startGuideDrag(q, false); }
  });
  canvas.on("mouse:move", opt => { rulerMouse = canvas.getPointer(opt.e); drawRulers(); });
  canvas.on("after:render", () => {
    drawRulers();
    if (!guidesShown || !userGuides.length) return;
    const ctx = canvas.contextTop, vpt = canvas.viewportTransform, z = canvas.getZoom();
    ctx.save(); ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1 / z;
    const far = 1e5;
    userGuides.forEach(q => { ctx.beginPath(); if (q.axis === "x") { ctx.moveTo(q.v, -far); ctx.lineTo(q.v, far); } else { ctx.moveTo(-far, q.v); ctx.lineTo(far, q.v); } ctx.stroke(); });
    if (guideDrag) {
      const q = guideDrag.q; ctx.fillStyle = "#22d3ee"; ctx.font = `${11 / z}px Sora, sans-serif`;
      const lbl = guideMm(q);
      if (q.axis === "x") ctx.fillText(lbl, q.v + 4 / z, (rulerMouse ? rulerMouse.y : 0) - 6 / z); else ctx.fillText(lbl, (rulerMouse ? rulerMouse.x : 0) + 6 / z, q.v - 4 / z);
    }
    ctx.restore();
  });
  // the guides' canvas layer is cleared with the top context, which Fabric does on each render
  drawRulers();
}

$("#btnRepeat").onclick = () => stepRepeat();

/* ---------- ✨ AI full-print patterns ----------
   The customer's words go to the API through the page (it holds the login);
   Claude answers with recipes, drawn here as vector shapes (ai-patterns.js)
   over each piece of the side chosen, under everything else, locked, always
   inside the garment. They print as the shapes they are: sharp, in CMYK. */
const AI = window.AXIOM_AI_PATTERN;
const AI_CHIPS = ["สายฟ้าเหลือง-ดำ ดุๆ", "ข้าวหลามตัดไล่สีชมพู", "คลื่นทะเลสไตล์ญี่ปุ่น น้ำเงิน", "ลายพรางดิจิทัลแดง", "ฮาล์ฟโทนไล่ลง สีทีม", "เศษแก้วแตก ม่วง-ส้ม"];
let aiSeq = 0, aiWaiting = null;
/** the panels the pattern goes on: the side chosen of an R-bib, else all */
function aiTargets() {
  return panels.map((p, i) => [p, i]).filter(([p]) => curStyle !== 2 || bodySide === "both" || (bodySide === "A") === !String(p.id).startsWith("inner")).map(([, i]) => i);
}
/** an AI pattern stays put (Layers unlocks it), and inside its piece */
function lockAi(o) {
  if (!o || !o._aiPattern) return;
  o.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, selectable: false, evented: false });
  if (canvas && canvas.getObjects().includes(o)) applyClip(o); else setTimeout(() => { applyClip(o); aiShowTweak(); }, 0);
}
const aiOnPanel = i => userObjects().filter(o => o._aiPattern && o._aiPanel === panels[i].id);
function aiThumb(spec) {
  const { svg } = AI.render(spec, 400, 480);
  const img = document.createElement("img"); img.className = "aithumb"; img.title = spec.name; img.alt = spec.name;
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  return img;
}
function aiShow(specs, note) {
  const box = $("#aiResults"); box.innerHTML = "";
  specs.forEach(s => {
    const cell = document.createElement("div");
    const im = aiThumb(s); im.onclick = () => applyAiPattern(s);
    const cap = document.createElement("div"); cap.textContent = s.name; cap.style.cssText = "font-size:10px;color:var(--muted);text-align:center;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    cell.appendChild(im); cell.appendChild(cap); box.appendChild(cell);
  });
  $("#aiMsg").textContent = note || "คลิกลายเพื่อใส่ · ปรับสี/ขนาดต่อได้ · ลายเป็นเวกเตอร์ พิมพ์คมทุกขนาด";
}
/** the recipe drawn on each piece of the side chosen, replacing an AI pattern already there */
async function applyAiPattern(spec) {
  const targets = aiTargets(); if (!targets.length) return;
  $("#aiMsg").textContent = "กำลังวางลาย…";
  for (const i of targets) {
    const p = panels[i];
    aiOnPanel(i).forEach(o => canvas.remove(o));
    const W = p.w * MM_PER_UNIT, H = p.h * MM_PER_UNIT;
    const { svg } = AI.render(spec, W, H);
    const g = await new Promise(ok => fabric.loadSVGFromString(svg, (objs, opts) => ok(fabric.util.groupSVGElements(objs, opts))));
    g.set({ scaleX: 1 / MM_PER_UNIT, scaleY: 1 / MM_PER_UNIT, originX: "center", originY: "center", left: p.cx, top: p.cy, objectCaching: true });
    g._aiPattern = true; g._aiPanel = p.id; g.aiSpec = spec; g.name = "✨ " + spec.name;
    g.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, selectable: false, evented: false });
    canvas.insertAt(g, 0);
    g.setCoords(); applyClip(g);
  }
  fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); pushHistory(); aiShowTweak();
  $("#aiMsg").textContent = `ใส่ลาย “${spec.name}” แล้ว${curStyle === 2 && bodySide !== "both" ? (bodySide === "A" ? " (ด้านนอก)" : " (ด้านใน)") : ""} · ปลดล็อกได้ในแผง Layers`;
}
/** the recipe on the side chosen (the first piece that has one) */
function aiCurrent() {
  for (const i of aiTargets()) { const o = aiOnPanel(i)[0]; if (o && o.aiSpec) return o.aiSpec; }
  return null;
}
function aiShowTweak() { const t = document.getElementById("aiTweak"); if (t) t.style.display = aiCurrent() ? "" : "none"; }
/** a small change to the recipe on the side chosen, drawn again: no AI call */
function aiTweak(kind) {
  const cur = aiCurrent(); if (!cur) return;
  const s = JSON.parse(JSON.stringify(cur)), lim = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const layers = s.layers || [];
  if (kind === "smaller" || kind === "bigger") layers.forEach(l => { l.scale = lim((l.scale || 1) * (kind === "bigger" ? 1.25 : 0.8), 0.3, 3); });
  if (kind === "fainter" || kind === "stronger") layers.forEach(l => { l.opacity = lim((l.opacity ?? 1) * (kind === "stronger" ? 1.25 : 0.75), 0.1, 1); });
  if (kind === "shuffle") layers.forEach(l => { l.seed = ((l.seed || 1) * 7 + 13) % 100000; });
  if (kind === "turn") layers.forEach(l => { l.angle = (((l.angle || 0) + 45 + 180) % 360) - 180; });
  if (kind === "swap" && layers.length) {
    // the background and the main motif (the top layer) trade colours: yellow bolts on black → black bolts on yellow
    const top = layers[layers.length - 1], bg = s.background.colors.slice(), fg = top.colors.slice();
    s.background.colors = fg.length > 1 || s.background.type === "solid" ? fg : [fg[0], fg[0]];
    top.colors = bg;
  }
  applyAiPattern(s);
}
document.querySelectorAll("[data-aitw]").forEach(b => b.onclick = () => aiTweak(b.dataset.aitw));
function aiReply(m) {
  if (!aiWaiting || m.id !== aiWaiting.id) return;
  aiWaiting = null; $("#aiGo").disabled = false; $("#aiGo").textContent = "✨ ออกแบบ";
  if (!m.ok) { $("#aiMsg").textContent = m.error || "AI ออกแบบไม่สำเร็จ ลองอีกครั้ง"; return; }
  aiShow(m.patterns || [], m.remaining !== undefined ? `เลือกลายที่ชอบ · วันนี้ใช้ได้อีก ${m.remaining} ครั้ง` : "");
}
$("#aiGo").onclick = () => {
  const prompt = ($("#aiPrompt").value || "").trim();
  if (prompt.length < 2) { $("#aiMsg").textContent = "พิมพ์ลายที่อยากได้ก่อน หรือคลิกตัวอย่างด้านบน"; return; }
  if (!inFrame() || !isLoggedIn) { $("#aiMsg").textContent = "ต้องเข้าสู่ระบบก่อนใช้ AI ออกแบบลาย · ลองปุ่ม 🎲 ตัวอย่าง ได้เลย"; return; }
  const own = curStyle === 2 && bodySide === "B" && sideB ? sideB.color : bodyColor;
  aiWaiting = { id: "ai" + (++aiSeq) };
  $("#aiGo").disabled = true; $("#aiGo").textContent = "กำลังคิด…"; $("#aiMsg").textContent = "AI กำลังออกแบบ 3 แบบ (ประมาณ 10–30 วินาที)";
  window.parent.postMessage({ type: "axiom-ai-pattern", id: aiWaiting.id, prompt, body: colorHex(own) || undefined, trim: colorHex(trimColor) || undefined, count: 3 }, "*");
  // no answer at all: say so rather than spin forever
  const mine = aiWaiting.id;
  setTimeout(() => { if (aiWaiting && aiWaiting.id === mine) aiReply({ id: mine, ok: false, error: "AI ไม่ตอบกลับ ลองอีกครั้ง" }); }, 90000);
};
$("#aiDemo").onclick = () => {
  const ex = AI.EXAMPLES.slice(), out = [];
  while (out.length < 4 && ex.length) out.push(ex.splice(Math.floor(Math.random() * ex.length), 1)[0]);
  aiShow(out, "สูตรตัวอย่าง (ไม่ได้ใช้ AI) · คลิกเพื่อใส่");
};
AI_CHIPS.forEach(t => { const c = document.createElement("span"); c.className = "aichip"; c.textContent = t; c.onclick = () => { $("#aiPrompt").value = t; $("#aiPrompt").focus(); }; $("#aiChips").appendChild(c); });

/* ---------- align / arrange ---------- */
function fixBackOrder() { const bg = [artboardRect].concat(bgObjects).filter(Boolean); bg.slice().reverse().forEach(o => o.sendToBack()); overlayGroups.filter(Boolean).forEach(o => o.bringToFront()); }
function moveBy(o, dx, dy) {
  o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
  if (clipOn) (o.type === "activeSelection" ? o._objects : [o]).forEach(applyClip);
}
/** the selection taken apart (each object in canvas units), and put back after */
function eachSelected(fn) {
  const sel = canvas.getActiveObject(); if (!sel) return;
  const multi = sel.type === "activeSelection", objs = multi ? sel.getObjects().slice() : [sel];
  if (multi) canvas.discardActiveObject();
  fn(objs, multi);
  if (multi) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  canvas.requestRenderAll(); syncProps(); pushHistory();
}
document.querySelectorAll("[data-align]").forEach(b => b.onclick = () => eachSelected((objs, multi) => {
  const a = b.dataset.align, boxes = objs.map(o => o.getBoundingRect(true, true));
  let L, T, R, B;
  if (multi) {
    L = Math.min(...boxes.map(q => q.left)); T = Math.min(...boxes.map(q => q.top));
    R = Math.max(...boxes.map(q => q.left + q.width)); B = Math.max(...boxes.map(q => q.top + q.height));
  } else {
    const p = panels[panelOf(objs[0])] || { x: 0, y: 0, w: ART.w, h: ART.h };
    L = p.x; T = p.y; R = p.x + p.w; B = p.y + p.h;
  }
  objs.forEach((o, i) => {
    const q = boxes[i];
    const dx = a === "left" ? L - q.left : a === "right" ? R - (q.left + q.width) : a === "cx" ? (L + R) / 2 - (q.left + q.width / 2) : 0;
    const dy = a === "top" ? T - q.top : a === "bottom" ? B - (q.top + q.height) : a === "cy" ? (T + B) / 2 - (q.top + q.height / 2) : 0;
    moveBy(o, dx, dy);
  });
}));
document.querySelectorAll("[data-flip]").forEach(b => b.onclick = () => {
  const o = canvas.getActiveObject(); if (!o) return;
  const k = b.dataset.flip === "x" ? "flipX" : "flipY";
  if (o.type !== "activeSelection") { o.set(k, !o[k]); if (clipOn) applyClip(o); canvas.requestRenderAll(); pushHistory(); return; }
  // several: each mirrored about the selection's middle, as Illustrator reflects a selection
  eachSelected(objs => {
    const boxes = objs.map(x => x.getBoundingRect(true, true));
    const mid = k === "flipX" ? (Math.min(...boxes.map(q => q.left)) + Math.max(...boxes.map(q => q.left + q.width))) / 2
      : (Math.min(...boxes.map(q => q.top)) + Math.max(...boxes.map(q => q.top + q.height))) / 2;
    objs.forEach(x => {
      const c = x.getCenterPoint();
      x.set(k, !x[k]); x.set("angle", -(x.angle || 0));
      x.setPositionByOrigin(k === "flipX" ? new fabric.Point(2 * mid - c.x, c.y) : new fabric.Point(c.x, 2 * mid - c.y), "center", "center");
      x.setCoords(); if (clipOn) applyClip(x);
    });
  });
});
document.querySelectorAll("[data-dist]").forEach(b => b.onclick = () => {
  const o = canvas.getActiveObject();
  if (!o || o.type !== "activeSelection" || o._objects.length < 3) { toast("เลือก 3 ชิ้นขึ้นไปเพื่อเว้นระยะเท่ากัน", "info"); return; }
  eachSelected(objs => {
    const h = b.dataset.dist === "h";
    const items = objs.map(x => ({ x, q: x.getBoundingRect(true, true) })).sort((p, r) => h ? p.q.left - r.q.left : p.q.top - r.q.top);
    const start = h ? items[0].q.left : items[0].q.top;
    const end = h ? Math.max(...items.map(i => i.q.left + i.q.width)) : Math.max(...items.map(i => i.q.top + i.q.height));
    const total = items.reduce((s, i) => s + (h ? i.q.width : i.q.height), 0);
    const gap = (end - start - total) / (items.length - 1);
    let at = start;
    items.forEach(i => { const d = at - (h ? i.q.left : i.q.top); moveBy(i.x, h ? d : 0, h ? 0 : d); at += (h ? i.q.width : i.q.height) + gap; });
  });
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
/** the selection's objects on their own (canvas units), and their middle */
function takeSelection() {
  const sel = canvas.getActiveObject(); if (!sel) return null;
  const objs = sel.type === "activeSelection" ? sel._objects.slice() : [sel];
  canvas.discardActiveObject();
  const bs = objs.map(o => o.getBoundingRect(true, true));
  const L = Math.min(...bs.map(b => b.left)), T = Math.min(...bs.map(b => b.top));
  const R = Math.max(...bs.map(b => b.left + b.width)), B = Math.max(...bs.map(b => b.top + b.height));
  return { objs, c: { x: (L + R) / 2, y: (T + B) / 2 } };
}
const cloneOf = o => new Promise(ok => o.clone(ok, CLONE_PROPS));
/** copies of the objects moved by (dx, dy) and turned by `rot` about their own middles, just above the top one */
async function addCopies(objs, dx, dy, rot) {
  const all = canvas.getObjects(), at = Math.max(...objs.map(o => all.indexOf(o))) + 1;
  const out = [];
  for (const o of objs) {
    const c = await cloneOf(o), m = c.getCenterPoint();
    c.set({ angle: (c.angle || 0) + rot, evented: true, selectable: true });
    c.setPositionByOrigin(new fabric.Point(m.x + dx, m.y + dy), "center", "center");
    out.push(c);
  }
  out.forEach((c, i) => { canvas.insertAt(c, at + i); c.setCoords(); if (clipOn) applyClip(c); });
  return out;
}
function selectAll(objs) { canvas.setActiveObject(objs.length > 1 ? new fabric.ActiveSelection(objs, { canvas }) : objs[0]); }
/* Ctrl+D, as Illustrator's Transform Again: a copy, and when that copy has been
   moved and Ctrl+D comes again, the next copy goes the same step further. */
let lastDup = null;
async function duplicate() {
  const s = takeSelection(); if (!s) return;
  let dx = 22, dy = 22;
  if (lastDup && lastDup.copies.length === s.objs.length && lastDup.copies.every(o => s.objs.includes(o))) { dx = s.c.x - lastDup.from.x; dy = s.c.y - lastDup.from.y; }
  if (Math.hypot(dx, dy) < 0.5) { dx = 22; dy = 22; }
  const copies = await addCopies(s.objs, dx, dy, 0);
  lastDup = { from: s.c, copies };
  selectAll(copies); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
}
/* Step and Repeat: the selection as the first cell of a grid, the others so many mm apart */
async function stepRepeat() {
  const cols = Math.max(1, Math.min(50, Math.round(+$("#repCols").value || 1))), rows = Math.max(1, Math.min(50, Math.round(+$("#repRows").value || 1)));
  const dx = (+$("#repDx").value || 0) / MM_PER_UNIT, dy = (+$("#repDy").value || 0) / MM_PER_UNIT, rot = +$("#repRot").value || 0;
  if (cols * rows < 2) { toast("ตั้งคอลัมน์หรือแถวให้มากกว่า 1", "info"); return; }
  const s = takeSelection(); if (!s) { toast("เลือกชิ้นที่จะทำซ้ำก่อน", "info"); return; }
  if (cols * rows * s.objs.length > 400) { selectAll(s.objs); toast("ทำซ้ำได้ไม่เกิน 400 ชิ้นต่อครั้ง", "warn"); return; }
  const made = [...s.objs];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!r && !c) continue;
    made.push(...await addCopies(s.objs, c * dx, r * dy, (r * cols + c) * rot));
  }
  lastDup = null;
  selectAll(made); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
  toast(`ทำซ้ำเป็น ${cols}×${rows} แล้ว`, "ok");
}
function delSelected() { canvas.getActiveObjects().forEach(o => canvas.remove(o)); canvas.discardActiveObject(); canvas.requestRenderAll(); pushHistory(); refreshLayers(); }

/* ---------- copy / paste ---------- */
let clipboard = null;
const CLONE_PROPS = ["name", "rosterTag", "arcMeta", "_clipMask", "_aiPattern", "_aiPanel", "aiSpec"];
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
/** the copy pasted where it was: in front of the selection, behind it, or on top */
function pasteInPlace(where) {
  if (!clipboard) { toast("ยังไม่ได้คัดลอก (Ctrl+C)", "info"); return; }
  const sel = canvas.getActiveObjects(), all = canvas.getObjects();
  const idxs = sel.map(o => all.indexOf(o)).filter(i => i >= 0);
  let at = where === "front" && idxs.length ? Math.max(...idxs) + 1 : where === "back" && idxs.length ? Math.min(...idxs) : all.length;
  clipboard.clone(cl => {
    canvas.discardActiveObject();
    cl.set({ evented: true });
    if (cl.type === "activeSelection") { cl.canvas = canvas; cl.forEachObject(o => { o.set({ evented: true, selectable: true }); canvas.insertAt(o, at++); }); cl.setCoords(); }
    else { cl.set({ selectable: true }); canvas.insertAt(cl, at); }
    canvas.setActiveObject(cl);
    if (clipOn) (cl._objects || [cl]).forEach(applyClip);
    fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); pushHistory();
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
/** locked: not moved, not picked on the canvas (Layers and Ctrl+Alt+2 unlock it) */
function setLocked(objs, l) {
  if (l && objs.some(o => canvas.getActiveObjects().includes(o))) canvas.discardActiveObject();
  objs.forEach(o => o.set({ lockMovementX: l, lockMovementY: l, lockScalingX: l, lockScalingY: l, lockRotation: l, selectable: !l && curTool === "select", evented: !l && curTool === "select" }));
  canvas.requestRenderAll(); refreshLayers(); pushHistory();
}
function setHidden(objs, h) {
  if (h) canvas.discardActiveObject();
  objs.forEach(o => { o.visible = !h; });
  canvas.requestRenderAll(); refreshLayers(); pushHistory();
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
    row.querySelector('[data-a="lock"]').onclick = () => { setLocked([o], !o.lockMovementX); };
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
if (styleSel) styleSel.onchange = () => { curStyle = +styleSel.value; showBodySide(); rebuildLayout(); if (clipOn) setTimeout(reclipAll, 200); };
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
function getDoc() {
  return {
    app: "axiom-designer", version: 5, art: ART, style: curStyle, size: TPL_SIZE,
    fabric: curFabric, trim: curTrim, cutOn, cutMm, bodyColor, trimColor, bodyPatternSrc, sideB,
    // names only — never the font bytes (licence), so the reader can warn if missing
    importedFonts: [...importedFonts.keys()],
    customInks,
    guides: userGuides,
    objects: userObjects().map(o => o.toObject(ARC_PROPS)),
  };
}
function inFrame() { return window.parent && window.parent !== window; }
function localSave() { const blob = new Blob([JSON.stringify(getDoc())], { type: "application/json" }); download("axiom-design.axiom", URL.createObjectURL(blob)); toast("ดาวน์โหลดไฟล์แล้ว"); }
$("#btnSave").onclick = () => {
  if (inFrame() && isLoggedIn) {
    window.parent.postMessage({ type: "axiom-save", payload: { name: "ดีไซน์ " + new Date().toLocaleDateString("th-TH"), doc: getDoc(), preview: exportPNG(0.5), style: curStyle } }, "*");
    toast("กำลังบันทึกเข้าบัญชี...");
  } else if (inFrame()) {
    toast("ยังไม่เข้าสู่ระบบ — ดาวน์โหลดไฟล์แทน", "warn"); localSave();
  } else { localSave(); }
};
function openDoc(doc) {
  if (doc && doc.app === "axiom-roster") {
    openDoc(doc.template || {});
    const rt = document.getElementById("rosterText");
    if (rt) rt.value = (doc.roster || []).map(r => [r.name || "", r.number || "", r.size || ""].join("\t")).join("\n");
    const on = document.getElementById("orderName");
    if (on) on.value = doc.name || "";
    updateRosterCount(); updateTagInfo();
    toast("เปิดออเดอร์ทีมแล้ว");
    return;
  }
  try {
    customInks = { ...(doc.customInks || {}) };
    userGuides = Array.isArray(doc.guides) ? doc.guides.filter(q => q && (q.axis === "x" || q.axis === "y") && isFinite(q.v)) : [];
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
    garmentCode("bodyCode", bodyColor); garmentCode("trimCode", trimColor);
    bodyPattern = null; bodyPatternSrc = doc.bodyPatternSrc || null;
    sideB = doc.sideB && typeof doc.sideB.color === "string" ? { color: doc.sideB.color, pat: doc.sideB.pat || null } : null;
    bodySide = "both"; showBodySide();
    buildTemplate();
    fabric.util.enlivenObjects(doc.objects || [], objs => { objs.forEach(o => { lockAi(o); canvas.add(o); }); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); }, "fabric");
    zoomFit(); updateDim(); toast("เปิดดีไซน์แล้ว");
    // imported fonts live in memory, not in the file — say so instead of
    // silently rendering the design in a substitute face
    const missing = (doc.importedFonts || []).filter(f => !isImported(f));
    if (missing.length) {
      toast(`ดีไซน์นี้ใช้ฟอนต์ที่นำเข้าเอง: ${missing.join(", ")}\nกดปุ่ม ＋ นำเข้าอีกครั้ง ไม่งั้นตัวอักษรจะแสดงเป็นฟอนต์สำรอง`, "warn");
    }
  } catch (e) { toast("เปิดดีไซน์ไม่สำเร็จ — ไฟล์อาจเสียหายหรือเป็นเวอร์ชันที่ไม่รองรับ", "err"); }
}
let heardFromPage = false;
window.addEventListener("message", ev => {
  const m = ev.data || {};
  if (m.type === "axiom-auth") {
    isLoggedIn = !!m.user;
    // the page may not have been listening when this editor said it was ready (it loads from
    // cache faster than the page starts): its first word to us is answered with "ready" again
    if (!heardFromPage) { heardFromPage = true; window.parent.postMessage({ type: "axiom-ready" }, "*"); }
  }
  else if (m.type === "axiom-ai-pattern-result") aiReply(m);
  else if (m.type === "axiom-save-result") toast(m.ok ? "บันทึกเข้าบัญชีแล้ว ✓" : ("บันทึกไม่สำเร็จ: " + (m.error || "")));
  else if (m.type === "axiom-publish-result") { const pm = document.getElementById("pubMsg"); if (m.ok) { if (pm) pm.textContent = "เผยแพร่ขายแล้ว ✓"; toast("เผยแพร่ขายในตลาดแล้ว ✓"); setTimeout(() => { const md = document.getElementById("pubModal"); if (md) md.classList.remove("on"); }, 900); } else { if (pm) pm.textContent = "ไม่สำเร็จ: " + (m.error || ""); toast("เผยแพร่ไม่สำเร็จ", "err"); } }
  else if (m.type === "axiom-save-order-result") { const p = document.getElementById("rosterProg"); if (p) p.textContent = m.ok ? "บันทึกออเดอร์เข้าบัญชีแล้ว ✓" : ("บันทึกไม่สำเร็จ: " + (m.error || "")); toast(m.ok ? "บันทึกออเดอร์แล้ว ✓" : "บันทึกไม่สำเร็จ"); }
  else if (m.type === "axiom-open" && m.doc) { openDoc(m.doc); if (m.watermark) setTimeout(applyWatermark, 120); }
  /* marketplace preview: repaint the same garment in a different colourway/size.
     Reuses the editor's own render path, so what a buyer sees is exactly what
     the editor would draw — no second renderer to drift out of sync. */
  else if (m.type === "axiom-set-variant") {
    try {
      if (m.bodyColor) setBodyColor(m.bodyColor);
      if (m.trimColor) setTrimColor(m.trimColor);
      let geomChanged = false;
      if (m.size && m.size !== TPL_SIZE) {
        TPL_SIZE = m.size;
        const zz = document.getElementById("sizeSel"); if (zz) zz.value = TPL_SIZE;
        geomChanged = true;
      }
      if (m.trim !== undefined && m.trim !== curTrim) {
        curTrim = m.trim; curLayout = "vertical";
        const tf = document.getElementById("trimSel"); if (tf) tf.value = curTrim;
        geomChanged = true;
      }
      // colours repaint inside setBodyColor/setTrimColor; size/trim change the
      // pattern outline, so the whole layout has to be rebuilt
      if (geomChanged) { rebuildLayout(); if (typeof updateDim === "function") updateDim(); }
      // every repaint clears the canvas — restamp, or the watermark vanishes
      // the moment a buyer clicks a swatch
      drawWatermark();
      reply({ type: "axiom-variant-ready", bodyColor, trimColor, size: TPL_SIZE, trim: curTrim });
    } catch (e) {
      reply({ type: "axiom-variant-ready", error: String(e && e.message || e) });
    }
  }
});

/** post back to the embedding page (no-op when opened standalone) */
function reply(msg) { if (inFrame()) window.parent.postMessage(msg, "*"); }

/* ---------- preview watermark ----------
   Stamped over an unpurchased template. Honest about what this is: it stops a
   right-click save, not a determined developer — the vector state is already
   in the browser by the time this draws. It is a speed bump, not a lock. */
let watermarkOn = false;
function applyWatermark() {
  watermarkOn = true;
  drawWatermark();
}
function drawWatermark() {
  if (!watermarkOn || !canvas) return;
  canvas.getObjects().filter(o => o._wm).forEach(o => canvas.remove(o));

  const W = ART.w, H = ART.h;
  const marks = [];
  // diagonal tiles so cropping one out still leaves others
  for (let y = -H * 0.2; y < H * 1.2; y += 130) {
    for (let x = -W * 0.2; x < W * 1.2; x += 260) {
      const t = new fabric.Text("AXIOM · ตัวอย่าง", {
        left: x, top: y, angle: -30,
        fontSize: 20, fontFamily: "Sora, sans-serif", fontWeight: "700",
        fill: "rgba(120,140,180,0.30)",
        selectable: false, evented: false, excludeFromExport: true,
      });
      t._wm = true;
      marks.push(t);
    }
  }
  marks.forEach(t => canvas.add(t));
  canvas.requestRenderAll();
}

/* ---------- preview mode ----------
   ?preview=1 strips the editor chrome and locks the canvas: the marketplace
   embeds this to show a live, colour-swappable garment without shipping a
   second rendering engine. */
function isPreview() { return /[?&]preview=1\b/.test(location.search); }
if (isPreview()) {
  document.documentElement.classList.add("previewmode");
  // a buyer must not be able to nudge the artwork out of place.
  // `canvas` is a top-level `let`, so it is NOT on window — reference it directly.
  const lockCanvas = () => {
    if (!canvas) return;
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.defaultCursor = "default";
    canvas.forEachObject(o => { o.selectable = false; o.evented = false; });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };
  // openDoc() adds objects, so re-lock after every variant/doc change
  window.addEventListener("message", ev => {
    const t = (ev.data || {}).type;
    if (t === "axiom-open" || t === "axiom-set-variant") setTimeout(lockCanvas, 60);
  });
  setTimeout(lockCanvas, 300);
}
$("#btnOpen").onclick = () => $("#fileOpen").click();
{ const bi = document.getElementById("btnImport"); if (bi) bi.onclick = () => { importMode = (document.getElementById("importTarget") || {}).value || "front"; const f = document.getElementById("fileImg"); if (f) f.click(); }; }
$("#fileOpen").addEventListener("change", ev => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { openDoc(JSON.parse(r.result)); }
    catch (e) { toast("ไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ .axiom ที่เซฟจากโปรแกรมนี้", "err"); }
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
/* ---------- text → outlines ----------
   An SVG that says font-family="Anton" only renders correctly on a machine
   that HAS Anton. The factory's laser/RIP software usually doesn't, and it
   silently substitutes another face — wrong widths, wrong cut lines.

   So before the file leaves us, every <text> becomes a <path>. We reuse the
   exact baseline coordinates Fabric already wrote into each <tspan>, which
   means the outline lands pixel-identical to what the user saw. No guessing
   at Fabric's internal text metrics.                                        */

const fontCache = new Map();   // "Family|700" -> opentype.Font
const fontFails = new Set();

function firstFamily(css) {
  return String(css || "").split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}
function normWeight(w) {
  const s = String(w || "400");
  if (s === "bold") return "700";
  return /^\d{3}$/.test(s) ? s : "400";
}

/* A logo made elsewhere and imported as SVG often keeps live text in a computer's own font
   (Arial, Helvetica, Times…), which isn't a Google font: outlined in its open twin with the
   very same letter widths (Arimo, Tinos, Cousine), so it lands where the screen shows it. */
const OUTLINE_TWINS = {
  "arial": "Arimo", "helvetica": "Arimo", "helvetica neue": "Arimo", "liberation sans": "Arimo",
  "times new roman": "Tinos", "times": "Tinos", "liberation serif": "Tinos",
  "courier new": "Cousine", "courier": "Cousine", "liberation mono": "Cousine",
};
/* Glyphs are placed by fontkit, which applies the font's own layout rules (GSUB / GPOS):
   a Thai tone mark over an upper vowel is raised (ที่, พี่) and one over ป / ฝ / ฟ moves
   clear of the tall stroke (ปู่). opentype.js drew every glyph at its default spot, so those
   marks landed inside the vowel or the stroke and vanished from the print. Loaded only when
   a print file is made (fontkit.min.js: npm run build:fontkit). */
let fontkitLoading = null;
function loadFontkit() {
  if (window.fontkit) return Promise.resolve(window.fontkit);
  return fontkitLoading || (fontkitLoading = new Promise(res => {
    const s = document.createElement("script");
    s.src = "fontkit.min.js";
    s.onload = () => res(window.fontkit || null);
    s.onerror = () => { fontkitLoading = null; res(null); };
    document.head.appendChild(s);
  }));
}
/** the opentype.js font, with its fontkit twin from the same bytes for layout (none: drawn glyph by glyph) */
async function withShaper(font, buf) {
  const fk = await loadFontkit();
  try { if (fk) font._fk = fk.create(new Uint8Array(buf)); } catch (e) { /* glyph by glyph, as before */ }
  return font;
}
async function loadOutlineFont(family, weight, text) {
  family = OUTLINE_TWINS[String(family).toLowerCase()] || family;
  const key = `${family}|${weight}${text ? "|" + text : ""}`;
  if (fontCache.has(key)) return fontCache.get(key);
  if (fontFails.has(key)) return null;
  if (typeof opentype === "undefined") { fontFails.add(key); return null; }
  try {
    const res = await fetch(`/api/fonts/${encodeURIComponent(family)}?weight=${weight}${text ? "&text=" + encodeURIComponent(text) : ""}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = await res.arrayBuffer();
    const font = await withShaper(opentype.parse(buf), buf);
    // bold asked of a family with no bold: the browser draws the regular thickened (synthetic bold)
    const served = res.headers.get("X-Font-Weight");
    if (+weight >= 600 && served && +served < 600) font._fauxBold = true;
    fontCache.set(key, font);
    return font;
  } catch (e) {
    fontFails.add(key);
    return null;
  }
}

/** every <text> in the doc, with the family/weight it needs */
function textNeeds(doc) {
  const need = new Map();
  doc.querySelectorAll("text").forEach(t => {
    const fam = firstFamily(t.getAttribute("font-family") || t.style.fontFamily);
    const w = normWeight(t.getAttribute("font-weight") || t.style.fontWeight);
    if (fam) need.set(`${fam}|${w}`, { family: fam, weight: w });
  });
  return [...need.values()];
}

/** whether the font draws this character (not its empty "missing" box) */
function hasGlyph(font, ch) {
  if (!ch.trim()) return true;
  const i = font.charToGlyphIndex(ch);
  return i !== null && i !== undefined && i > 0;
}
/** every family in a CSS font stack, generic names left out */
function stackFamilies(css) {
  return String(css || "").split(",").map(f => f.trim().replace(/^['"]|['"]$/g, "")).filter(f => f && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(f));
}
/** after the text's own stack, the faces the browser falls back to for Thai and Japanese */
const OUTLINE_FALLBACKS = ["Noto Sans Thai", "Noto Sans JP"];

/**
 * The fonts a text needs, in order: its own, then — for each character its own
 * font lacks — the next in its stack or a fallback, as the browser picks one on
 * screen. A Thai or Japanese name set in a Latin face would otherwise come out as
 * empty boxes. `missing`: characters no font has.
 */
async function fontsForText(t, primary, weight) {
  const chars = [...new Set([...(t.textContent || "")])];
  let missing = chars.filter(ch => !hasGlyph(primary, ch));
  const fonts = [primary];
  // the text's own family first (its file holds one script; asked for the letters it has them all), then its stack, then the fallbacks
  const stack = stackFamilies(t.getAttribute("font-family") || t.style.fontFamily);
  for (const fam of [...new Set([...stack, ...OUTLINE_FALLBACKS])]) {
    if (!missing.length) break;
    if (importedFonts.has(fam)) continue; // the customer's own file: what it lacks, it lacks
    const want = missing.slice().sort().join("");
    const f = (await loadOutlineFont(fam, weight, want)) || (weight !== "400" ? await loadOutlineFont(fam, "400", want) : null);
    if (!f || fonts.includes(f)) continue;
    if (missing.some(ch => hasGlyph(f, ch))) { fonts.push(f); missing = missing.filter(ch => !hasGlyph(f, ch)); }
  }
  return { fonts, missing };
}

/** convert one <text> element into a <path>, in place; `fonts`: its own first, then fallbacks per character */
function textToPath(t, fonts) {
  if (!Array.isArray(fonts)) fonts = [fonts];
  const size = parseFloat(t.getAttribute("font-size") || t.style.fontSize || "40");
  const spacing = parseFloat(t.style.letterSpacing || "0") || 0;
  // a letter keeps its vowels and tone marks: the cluster is drawn by one font, laid out together
  const pick = cl => fonts.find(f => [...cl].every(ch => hasGlyph(f, ch))) || fonts.find(f => hasGlyph(f, [...cl][0])) || fonts[0];
  const clusters = text => {
    const out = [];
    for (const ch of text) { if (out.length && /\p{M}/u.test(ch)) out[out.length - 1] += ch; else out.push(ch); }
    return out;
  };
  // the text split where its font changes, so each run is shaped (kerned, marks placed) by its own font
  const pieces = text => {
    const out = [];
    for (const cl of clusters(text)) {
      const f = pick(cl), last = out[out.length - 1];
      if (last && last.font === f) last.text += cl; else out.push({ font: f, text: cl });
    }
    return out;
  };
  /** one piece drawn from x on baseline y: its path data and how far it moves on (letter spacing after each spacing glyph) */
  const drawPiece = (pc, x, y) => {
    const fk = pc.font._fk;
    if (fk) {
      const k = size / fk.unitsPerEm, run = fk.layout(pc.text);
      let d = "", at = x;
      run.glyphs.forEach((g, i) => {
        const p = run.positions[i];
        d += g.path.scale(k, -k).translate(at + p.xOffset * k, y - p.yOffset * k).toSVG() + " ";
        at += p.xAdvance * k + (p.xAdvance > 0 ? spacing : 0);
      });
      return { d, adv: at - x };
    }
    if (!spacing) return { d: pc.font.getPath(pc.text, x, y, size).toPathData(3) + " ", adv: pc.font.getAdvanceWidth(pc.text, size) };
    let d = "", at = x;
    for (const cl of clusters(pc.text)) {
      d += pc.font.getPath(cl, at, y, size).toPathData(3) + " ";
      at += pc.font.getAdvanceWidth(cl, size) + spacing;
    }
    return { d, adv: at - x };
  };
  const width = text => Math.max(0, pieces(text).reduce((w, pc) => w + drawPiece(pc, 0, 0).adv, 0) - spacing);

  // Fabric writes one <tspan> per line (or per char), each carrying the
  // absolute x/y of its baseline. That is precisely what opentype wants.
  const spans = t.querySelectorAll("tspan");
  const runs = spans.length
    ? [...spans].map(s => ({ x: parseFloat(s.getAttribute("x") || "0"), y: parseFloat(s.getAttribute("y") || "0"), text: s.textContent || "" }))
    : [{ x: parseFloat(t.getAttribute("x") || "0"), y: parseFloat(t.getAttribute("y") || "0"), text: t.textContent || "" }];

  const anchor = t.getAttribute("text-anchor") || "start";

  // a font without the bold asked for is drawn thickened, as the browser does (synthetic bold): kept apart
  let d = "", dBold = "";
  for (const run of runs) {
    if (!run.text) continue;
    let x = run.x;
    if (anchor !== "start") { const w = width(run.text); x -= anchor === "middle" ? w / 2 : w; }
    for (const pc of pieces(run.text)) {
      const { d: pd, adv } = drawPiece(pc, x, run.y);
      if (pc.font._fauxBold) dBold += pd; else d += pd;
      x += adv;
    }
  }
  if (!d.trim() && !dBold.trim()) { t.remove(); return; }

  const mk = (data, faux) => {
    const p = t.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", data.trim());
    // carry over every paint attribute the text had — and its style, where Fabric writes
    // its stroke (an outlined name lost its keyline without it), paint order and dashes
    // paint-order is an attribute of its own (Fabric's paintFirst "stroke": the keyline under the letters);
    // without it the outline printed over the letters and ate into them
    for (const a of ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-linejoin", "stroke-miterlimit", "stroke-linecap", "stroke-dasharray", "stroke-opacity", "paint-order", "opacity", "transform", "style"]) {
      const v = t.getAttribute(a);
      if (v) p.setAttribute(a, v);
    }
    if (!p.getAttribute("fill") && !p.style.fill) p.setAttribute("fill", t.style.fill || "#000");
    // synthetic bold: the outline grown by about 1/28 of the size, in its own colour
    const sk = p.style.stroke || p.getAttribute("stroke"), skw = parseFloat(p.style.strokeWidth || p.getAttribute("stroke-width") || "0");
    const strokeNone = !sk || sk === "none" || !(skw > 0);
    if (faux && strokeNone) {
      p.style.stroke = p.style.fill || p.getAttribute("fill");
      p.style.strokeWidth = String(+(size / 28).toFixed(3));
      p.style.strokeLinejoin = "round";
    }
    return p;
  };
  if (dBold.trim()) t.parentNode.insertBefore(mk(dBold, true), t);
  if (d.trim()) t.parentNode.insertBefore(mk(d, false), t);
  t.remove();
}

/** returns { svg, converted, skipped[] } */
async function outlineSVG(svgStr) {
  const doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
  if (doc.querySelector("parsererror")) return { svg: svgStr, converted: 0, skipped: ["ไฟล์ SVG อ่านไม่ได้"] };

  const needs = textNeeds(doc);
  if (!needs.length) return { svg: svgStr, converted: 0, skipped: [] };

  const fonts = new Map();
  await Promise.all(needs.map(async n => {
    const f = await loadOutlineFont(n.family, n.weight);
    if (f) fonts.set(`${n.family}|${n.weight}`, f);
  }));

  let converted = 0;
  const skipped = new Set();
  for (const t of [...doc.querySelectorAll("text")]) {
    const fam = firstFamily(t.getAttribute("font-family") || t.style.fontFamily);
    const w = normWeight(t.getAttribute("font-weight") || t.style.fontWeight);
    const font = fonts.get(`${fam}|${w}`);
    if (!font) { skipped.add(fam || "?"); continue; }   // leave as <text>, warn below
    const { fonts: list, missing } = await fontsForText(t, font, w);
    if (missing.length) skipped.add(`${fam} (ไม่มีตัว ${missing.join(" ")})`);
    textToPath(t, list);
    converted++;
  }

  return { svg: new XMLSerializer().serializeToString(doc), converted, skipped: [...skipped] };
}

/** production SVG: vector shapes only, no font dependency.
 *  `quiet` suppresses the warning toast — the batch loop calls this 40 times. */
let warnedFonts = "";
async function buildOutlinedSVG(quiet) {
  const r = await outlineSVG(buildSVGString());
  if (r.skipped.length) {
    const msg = `แปลงตัวหนังสือเป็นเส้นไม่ได้: ${r.skipped.join(", ")}\nไฟล์นี้ยังต้องใช้ฟอนต์ดังกล่าว — ถ้าเครื่องโรงงานไม่มี ตัวอักษรจะเพี้ยน`;
    if (!quiet && msg !== warnedFonts) { toast(msg, "warn"); warnedFonts = msg; }
  }
  return r.svg;
}

$("#btnSvg").onclick = () => runExport(async () => {
  const svg = await buildOutlinedSVG();
  download("axiom-design.svg", URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })));
  toast("ดาวน์โหลด SVG (ตัวหนังสือเป็นเส้นแล้ว) ✓");
});

/* ---------- publish to marketplace ---------- */
{
  const pb = document.getElementById("btnPublish");
  if (pb) pb.onclick = () => {
    if (!inFrame() || !isLoggedIn) { toast("ต้องเข้าสู่ระบบก่อนขายในตลาด", "warn"); return; }
    // the buyer will not have the seller's font file — refuse rather than
    // sell a template that renders in the wrong face on their screen
    const impUse = objectsUsingImportedFonts();
    if (impUse.length) {
      const fams = [...new Set(impUse.map(o => (isArc(o) ? arcMetaOf(o).fontFamily : o.fontFamily).split(",")[0].replace(/["']/g, "").trim()))];
      toast(`เผยแพร่ขายไม่ได้: ดีไซน์ใช้ฟอนต์ที่นำเข้าเอง (${fams.join(", ")})\nคนซื้อไม่มีไฟล์ฟอนต์นี้ — เปลี่ยนเป็นฟอนต์ในระบบก่อน`, "err");
      return;
    }
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
  if (ctrl && k === "a") { e.preventDefault(); const objs = userObjects().filter(o => o.visible !== false && !o.lockMovementX); canvas.discardActiveObject(); if (objs.length) canvas.setActiveObject(objs.length > 1 ? new fabric.ActiveSelection(objs, { canvas }) : objs[0]); canvas.requestRenderAll(); syncProps(); return; }
  if (ctrl && e.code === "Digit2") { e.preventDefault(); if (e.altKey) setLocked(userObjects().filter(o => o.lockMovementX), false); else if (canvas.getActiveObjects().length) setLocked(canvas.getActiveObjects(), true); return; }
  if (ctrl && e.code === "Digit3") { e.preventDefault(); if (e.altKey) setHidden(userObjects().filter(o => o.visible === false), false); else if (canvas.getActiveObjects().length) setHidden(canvas.getActiveObjects(), true); return; }
  if (ctrl && (e.code === "BracketRight" || e.code === "BracketLeft")) {
    e.preventDefault();
    const a = e.code === "BracketRight" ? (e.shiftKey ? "front" : "forward") : (e.shiftKey ? "back" : "backward");
    const b = document.querySelector(`[data-arrange="${a}"]`); if (b) b.click(); return;
  }
  if (ctrl && k === "r") { e.preventDefault(); document.documentElement.classList.toggle("norulers"); canvas.requestRenderAll(); return; }
  if (ctrl && (e.code === "Semicolon")) { e.preventDefault(); guidesShown = !guidesShown; canvas.requestRenderAll(); toast(guidesShown ? "แสดงไกด์" : "ซ่อนไกด์"); return; }
  if (ctrl && k === "f") { e.preventDefault(); pasteInPlace("front"); return; }
  if (ctrl && k === "b") { e.preventDefault(); pasteInPlace("back"); return; }
  if (ctrl && e.shiftKey && k === "v") { e.preventDefault(); pasteInPlace("top"); return; }
  if (ctrl && (k === "7" || e.code === "Digit7")) { e.preventDefault(); e.altKey ? releaseClipMask() : makeClipMask(); return; }
  if (ctrl && (k === "c" || k === "v" || k === "x")) return; // handled by clipboard events below
  if (ctrl && k === "0") { e.preventDefault(); zoomFit(); return; }
  if (ctrl) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSelected(); return; }
  if (e.key === "Escape") { if (penActive) cancelPen(); else { canvas.discardActiveObject(); canvas.requestRenderAll(); } setTool("select"); return; }
  if (e.key.indexOf("Arrow") === 0) {
    const objs = canvas.getActiveObjects();
    if (objs.length) {
      e.preventDefault();
      const s = (e.shiftKey ? 10 : 1) / MM_PER_UNIT; // 1 mm, Shift 10 mm
      const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0;
      const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0;
      objs.forEach(o => { o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords(); if (clipOn) applyClip(o); });
      canvas.requestRenderAll(); nudgeHist();
    }
    return;
  }
  if (k === "c" && !e.shiftKey) { placeOnGarment(0, 0, true); return; } // C = center on shirt
  const map = { g: "gradient", v: "select", a: "node", p: "pen", m: "rect", l: "ellipse", y: "poly", "\\": "line", t: "text", h: "hand" };
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
/** rows of diamonds, each shaded dark at the top to light at the bottom (cols: dark … light) */
function diamonds(ctx, W, H, cols, sc){
  const dark = cols[0], light = cols[cols.length - 1], cw = 118 * sc, ch = cw;
  ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H);
  for (let r = -1, y = -ch / 2; y < H + ch; r++, y += ch / 2) {
    const off = (r & 1) ? cw / 2 : 0;
    for (let x = -cw + off; x < W + cw; x += cw) {
      const g = ctx.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, dark); g.addColorStop(1, light);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + cw / 2, y); ctx.lineTo(x + cw, y + ch / 2); ctx.lineTo(x + cw / 2, y + ch); ctx.lineTo(x, y + ch / 2); ctx.closePath(); ctx.fill();
    }
  }
}
const PATTERNS = [
  { n: "ข้าวหลามตัดแดง", cols: ["#960a14","#eb282d"], g: diamonds },
  { n: "ข้าวหลามตัดเขียว", cols: ["#145f1e","#78be32"], g: diamonds },
  { n: "ข้าวหลามตัดน้ำเงิน", cols: ["#0b1f5c","#2f7de1"], g: diamonds },
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
let patOwn = null; // [dark, light] picked for the ready-made patterns
function spreadCols(two, n) { if (n <= 2) return two.slice(0, Math.max(1, n)); const a = new fabric.Color(two[0]).getSource(), b = new fabric.Color(two[1]).getSource(); return Array.from({ length: n }, (_, i) => "#" + [0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * i / (n - 1)).toString(16).padStart(2, "0")).join("")); }
function renderCurrentPattern(){ if (!lastPat) return; const cols = patOwn ? spreadCols(patOwn, lastPat.cols.length) : patUseBrand ? brandCols() : lastPat.cols; const c = document.createElement("canvas"), K = 3; c.width = 560 * K; c.height = 660 * K; const x = c.getContext("2d"); x.scale(K, K); lastPat.g(x, 560, 660, cols, patScale); setPattern(c.toDataURL("image/png")); }
function applyPattern(pat){ lastPat = pat; renderCurrentPattern(); toast("ใส่ลาย " + pat.n); }
function buildPatternGallery(){ const gr = document.getElementById("patGrid"); if (!gr) return; gr.innerHTML = ""; PATTERNS.forEach(pat => { const c = document.createElement("canvas"); c.className = "patthumb"; c.title = pat.n; c.width = 48; c.height = 58; pat.g(c.getContext("2d"), 48, 58, pat.cols, 0.4); c.onclick = () => applyPattern(pat); gr.appendChild(c); }); }
const patSizeEl = document.getElementById("patSize"); if (patSizeEl) patSizeEl.oninput = e => { patScale = +e.target.value; const v = document.getElementById("patSizeV"); if (v) v.textContent = (+e.target.value).toFixed(1) + "×"; renderCurrentPattern(); };
const patBrandEl = document.getElementById("patBrand"); if (patBrandEl) patBrandEl.onchange = e => { patUseBrand = e.target.checked; renderCurrentPattern(); };
{ const own = document.getElementById("patOwn"), c1 = document.getElementById("patC1"), c2 = document.getElementById("patC2");
  const go = () => { patOwn = own.checked ? [c1.value, c2.value] : null; renderCurrentPattern(); };
  if (own) { own.onchange = go; c1.onchange = () => { own.checked = true; go(); }; c2.onchange = () => { own.checked = true; go(); }; } }

/* ---------- fonts + clip-to-garment ---------- */
let curFont = "Sora", clipOn = false;
/* Every family below ships under the SIL Open Font License via Google Fonts —
   free to use commercially, including printed on garments we sell.          */
const FONT_GROUPS = [
  { label: "ไทย", fonts: ["Kanit", "Prompt", "Mitr", "Bai Jamjuree", "K2D", "Athiti", "Krub", "Chakra Petch", "Sarabun", "Pridi", "Noto Sans Thai"] },
  { label: "กีฬา / ตัวหนา", fonts: ["Anton", "Bebas Neue", "Graduate", "Black Ops One", "Russo One", "Staatliches", "Squada One", "Archivo Black", "Bungee", "Teko", "Big Shoulders Display"] },
  { label: "แคบ / คอนเดนส์", fonts: ["Oswald", "Fjalla One", "Saira Condensed", "Barlow Condensed"] },
  { label: "ตัวเขียน / สคริปต์", fonts: ["Kaushan Script", "Yellowtail", "Lobster", "Pacifico", "Permanent Marker", "Damion"] },
  { label: "ทั่วไป", fonts: ["Sora", "Montserrat"] },
];
/* fonts the user brought themselves. Held in memory ONLY — never uploaded,
   never saved into a design, never published to the marketplace. Redistributing
   a font file is what most commercial font licences forbid, and exports don't
   need it anyway: text is converted to outlines on the way out.             */
const IMPORTED_GROUP = { label: "นำเข้าเอง (ในเครื่องนี้)", fonts: [] };
const importedFonts = new Map(); // family -> opentype.Font

let FONTS = FONT_GROUPS.flatMap(g => g.fonts);
function refreshFontList() {
  const groups = importedFonts.size ? [IMPORTED_GROUP, ...FONT_GROUPS] : FONT_GROUPS;
  FONTS = groups.flatMap(g => g.fonts);
  return groups;
}
function isImported(family) { return importedFonts.has(family); }
function fontStack(f) { return '"' + f + '", "Noto Sans Thai", sans-serif'; }
/** friendly name for the face inside the file, falling back to the filename */
function familyNameOf(font, file) {
  const n = font.names || {};
  const pick = o => o && (o.en || Object.values(o)[0]);
  return (pick(n.preferredFamily) || pick(n.fontFamily) || file.name.replace(/\.[^.]+$/, "")).trim();
}

async function importFontFile(file) {
  if (typeof opentype === "undefined") { toast("ตัวแปลงฟอนต์ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง", "warn"); return; }
  if (file.size > 8 * 1024 * 1024) { toast("ไฟล์ฟอนต์ใหญ่เกิน 8MB", "err"); return; }

  const buf = await file.arrayBuffer();
  const tag = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (tag === "wOF2") { toast("ไม่รองรับไฟล์ .woff2\n(บีบอัดด้วย Brotli อ่านไม่ได้) — ใช้ .ttf .otf หรือ .woff แทน", "err"); return; }

  let font;
  try { font = opentype.parse(buf); }
  catch (e) { toast("อ่านไฟล์ฟอนต์ไม่ได้: " + (e.message || "ไฟล์เสียหาย"), "err"); return; }

  const family = familyNameOf(font, file);
  if (FONTS.includes(family) && !isImported(family)) { toast(`มีฟอนต์ชื่อ "${family}" อยู่แล้วในระบบ`, "warn"); return; }

  // 1) let the canvas render it
  try {
    const face = new FontFace(family, buf);
    await face.load();
    document.fonts.add(face);
  } catch (e) { toast("เบราว์เซอร์ใช้ฟอนต์นี้ไม่ได้: " + (e.message || ""), "err"); return; }

  // 2) let the exporter outline it — this is why the factory file stays correct
  await withShaper(font, buf);
  importedFonts.set(family, font);
  for (const w of ["400", "700"]) fontCache.set(`${family}|${w}`, font);
  if (!IMPORTED_GROUP.fonts.includes(family)) IMPORTED_GROUP.fonts.push(family);

  refreshFontList();
  buildFontSelect();
  const sel = document.getElementById("fontSel");
  if (sel) { sel.value = family; sel.onchange(); }
  toast(`นำเข้า "${family}" แล้ว — ใช้ได้เฉพาะเบราว์เซอร์นี้`, "ok");
}

function bindFontImport() {
  const btn = document.getElementById("btnFontImport");
  const inp = document.getElementById("fileFont");
  if (!btn || !inp) return;
  btn.onclick = () => {
    if (!confirm(
      "นำเข้าฟอนต์\n\n" +
      "• คุณต้องมีสิทธิ์ใช้ฟอนต์นี้ตามกฎหมาย (ฟอนต์เชิงพาณิชย์ส่วนใหญ่ห้ามแจกจ่ายไฟล์)\n" +
      "• ฟอนต์เก็บไว้ในเบราว์เซอร์นี้เท่านั้น ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์\n" +
      "• เปิดดีไซน์นี้ในเครื่องอื่น หรือรีเฟรชหน้า จะต้องนำเข้าใหม่\n" +
      "• เผยแพร่ขายในตลาดลายไม่ได้\n\n" +
      "ไฟล์ที่ export ไปโรงงานจะถูกแปลงเป็นเส้น จึงไม่เพี้ยนแน่นอน\n\nดำเนินการต่อ?"
    )) return;
    inp.click();
  };
  inp.onchange = async ev => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (f) await importFontFile(f);
  };
}

/** any object on the canvas using a font the user imported */
function objectsUsingImportedFonts() {
  return userObjects().filter(o => {
    if (!isTextish(o)) return false;
    const fam = (isArc(o) ? arcMetaOf(o).fontFamily : o.fontFamily) || "";
    return isImported(fam.split(",")[0].trim().replace(/^["']|["']$/g, ""));
  });
}

function buildFontSelect() {
  const el = document.getElementById("fontSel"); if (!el) return;
  // grouped, and each option previews itself in its own face
  el.innerHTML = refreshFontList().map(g =>
    `<optgroup label="${g.label}">` +
    g.fonts.map(f => `<option value="${f}" style="font-family:'${f}',sans-serif">${f}</option>`).join("") +
    `</optgroup>`,
  ).join("");
  el.value = curFont;
  el.onchange = async () => {
    curFont = el.value;
    const o = canvas.getActiveObject();
    if (!o || !isTextish(o)) return;
    const stack = fontStack(curFont);
    // wait for the face, otherwise an arc measures the fallback font
    await ensureFont(stack, arcMetaOf(o).fontSize, arcMetaOf(o).fontWeight);
    if (isArc(o)) rebuildArc(o, { fontFamily: stack });
    else o.set("fontFamily", stack);
    canvas.requestRenderAll(); pushHistory();
  };
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
  if (!clipOn && !obj._aiPattern) { if (obj.clipPath) { obj.clipPath = null; obj.dirty = true; canvas.requestRenderAll(); } return; }
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
  if (!objs.length) { toast("เลือกข้อความ/วัตถุก่อน", "info"); return; }
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
/* ---------- curved (arched) text ----------
   Fabric has no built-in text-on-path that survives our SVG export, so an arc
   is a Group of single characters rotated along a circle. `arcMeta` keeps
   everything needed to re-render it, so it round-trips through save/open and
   can be flattened back to a plain IText when the curve returns to 0.        */
const ARC_PROPS = ["name", "rosterTag", "arcMeta", "_clipMask", "_aiPattern", "_aiPanel", "aiSpec"];

function isArc(o) { return !!(o && (o.arcMeta || o._warpPending)); }

/** a real editable text object. Arc groups are deliberately excluded: the
 *  batch generator swaps `.text` on these in a loop, and rebuilding an arc
 *  replaces the canvas object, which would invalidate its own iteration. */
function isText(o) { return o && String(o.type).includes("text"); }

/** anything the text panel can style (plain text OR an arc group) */
function isTextish(o) { return isText(o) || isArc(o); }

function taggedObjs(tag) { return userObjects().filter(o => o.rosterTag === tag && isText(o)); }

/** widest angle the whole string may span, at |curve| = 100 */
const ARC_MAX_ANGLE = 150 * Math.PI / 180;

/** curve (-100..100) → signed radius in px. 0 means "straight".
 *  Derived from the angle the text should span, not the other way round:
 *  picking a radius directly makes small curves invisible and large ones wrap. */
function arcRadius(curve, width) {
  const c = Math.min(100, Math.max(-100, curve));
  if (c === 0 || width <= 0) return 0;
  const angle = (Math.abs(c) / 100) * ARC_MAX_ANGLE; // radians spanned
  const r = width / angle;
  return c > 0 ? r : -r;
}

function buildArcGroup(meta, at) {
  const { text, curve, fontSize, fontFamily, fontWeight, fontStyle, charSpacing, fill, stroke, strokeWidth } = meta;
  const chars = [...String(text || " ")];
  const common = { fontSize, fontFamily, fontWeight, fontStyle, fill, stroke, strokeWidth, strokeUniform: true, originX: "center", originY: "center", objectCaching: false };

  // measure each glyph so proportional fonts don't bunch up
  const probes = chars.map(ch => new fabric.Text(ch === " " ? " " : ch, common));
  const gaps = probes.map(p => p.width + (charSpacing || 0) / 1000 * fontSize);
  const total = gaps.reduce((a, b) => a + b, 0);
  const R = arcRadius(curve, total);

  if (!R) {
    // straight: a plain IText is nicer to edit
    const t = new fabric.IText(text, { ...common, charSpacing, left: at.left, top: at.top, originX: "center", originY: "center" });
    return t;
  }

  const dir = R > 0 ? -1 : 1;      // positive curve arcs upward
  const r = Math.abs(R);
  const totalAngle = total / r;     // radians spanned by the whole string
  let a = -totalAngle / 2;

  const objs = [];
  chars.forEach((ch, i) => {
    const step = gaps[i] / r;
    const mid = a + step / 2;
    const t = new fabric.Text(ch === " " ? " " : ch, {
      ...common, charSpacing: 0,
      left: r * Math.sin(mid),
      top: dir * (r * Math.cos(mid) - r), // keep the middle of the arc at y=0
      angle: (mid * 180 / Math.PI) * -dir,
    });
    objs.push(t);
    a += step;
  });

  const g = new fabric.Group(objs, { left: at.left, top: at.top, originX: "center", originY: "center", objectCaching: false });
  g.arcMeta = { ...meta };
  return g;
}

/** Webfonts load asynchronously. An arc measures every glyph, so building one
 *  before its face is ready gives fallback-font widths and a lopsided curve. */
function ensureFont(stack, size, weight) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  try { return document.fonts.load(`${weight || 400} ${Math.max(12, size || 40)}px ${stack}`); }
  catch { return Promise.resolve(); }
}

/** re-measure every arc on the canvas (after fonts finish loading) */
function reflowArcs() {
  const arcs = userObjects().filter(isArc);
  if (!arcs.length) return;
  const hadActive = canvas.getActiveObject();
  arcs.forEach(o => rebuildArc(o, {}));
  if (!hadActive) canvas.discardActiveObject();
  canvas.requestRenderAll();
}

/** metadata snapshot of any text-ish object */
function arcMetaOf(o) {
  if (o._warpPending) return { ...o._warpPending }; // a warp still being built
  if (isArc(o)) return { ...o.arcMeta };
  return {
    text: o.text || "",
    curve: 0,
    fontSize: o.fontSize || 40,
    fontFamily: o.fontFamily || fontStack(curFont),
    fontWeight: o.fontWeight || "normal",
    fontStyle: o.fontStyle || "normal",
    charSpacing: o.charSpacing || 0,
    fill: o.fill || "#111111",
    stroke: o.stroke || "",
    strokeWidth: o.strokeWidth || 0,
    paintFirst: o.paintFirst || "fill",
    warp: { style: "none", bend: 50 },
  };
}

/** replace `o` in-place with a re-rendered version carrying `patch` */
function rebuildArc(o, patch) {
  // a warp still being built: the next edit goes on top of it, not on the old text
  const meta = { ...arcMetaOf(o), ...patch };
  if (patch.curve || (patch.warp && patch.warp.style !== "none")) meta.onPath = null;
  if (meta.onPath) { rebuildOnPath(o, meta); return o; }
  if (meta.warp && meta.warp.style !== "none" && meta.warp.bend) { rebuildWarp(o, { ...meta, curve: 0 }); return o; }
  // the rebuilt object always has a centre origin; anchor it on the old centre
  // so straight ⇄ curved never makes the text jump half its width
  const c = o.getCenterPoint();
  const at = { left: c.x, top: c.y };
  const keep = { angle: o.angle || 0, opacity: o.opacity ?? 1, name: o.name, rosterTag: o.rosterTag };

  const next = buildArcGroup(meta, at);
  next.set(keep);
  if (meta.curve) next.arcMeta = meta;

  const idx = canvas.getObjects().indexOf(o);
  canvas.remove(o);
  canvas.add(next);
  if (idx >= 0) next.moveTo(idx);        // keep its place in the layer stack
  if (clipOn) applyClip(next);           // stay inside the garment shape
  canvas.setActiveObject(next);
  fixBackOrder();
  canvas.requestRenderAll();
  return next;
}

/* ---------- warped text, as Illustrator's Effect > Warp ----------
   The text is outlined (the print's own outlines), its points flattened finely
   and moved by the warp; arcMeta keeps the text, font and warp, so it can be
   edited and re-warped (like the curved text) and saved. */
const WARPS = {
  // u: −1 (left) … 1 (right) across the text; v: 0 (top) … 1 (bottom); A: the bend in units
  arc: (u, v, A) => -A * (1 - u * u),
  arcUpper: (u, v, A) => -A * (1 - u * u) * (1 - v),
  arcLower: (u, v, A) => A * (1 - u * u) * v,
  arch: (u, v, A) => -A * (1 - u * u) * (1 - 0.5 * v),
  bulge: (u, v, A) => -A * 0.6 * (1 - u * u) * (1 - 2 * v),
  flag: (u, v, A) => A * 0.35 * Math.sin(u * Math.PI),
  rise: (u, v, A) => -A * 0.5 * u,
};
async function warpedOutline(meta) {
  await loadPaper();
  await ensureFont(meta.fontFamily, meta.fontSize, meta.fontWeight);
  const t = new fabric.IText(meta.text || " ", { fontSize: meta.fontSize, fontFamily: meta.fontFamily, fontWeight: meta.fontWeight, fontStyle: meta.fontStyle, charSpacing: meta.charSpacing || 0, fill: "#000000", left: 0, top: 0 });
  const r = await outlineSVG(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${t.toSVG()}</svg>`);
  const root = paper.project.importSVG(r.svg, { insert: false, expandShapes: true });
  const whole = new paper.CompoundPath({ insert: false });
  for (const c of root.getItems({ match: x => x instanceof paper.Path && !x.clipMask })) {
    const p = c.clone({ insert: false });
    p.applyMatrix = true;
    if (c.parent) p.transform(c.parent.globalMatrix);
    whole.addChild(p);
  }
  if (!whole.children.length) return null;
  const b = whole.bounds, f = WARPS[meta.warp.style] || WARPS.arc;
  const A = (meta.warp.bend / 100) * b.height;
  whole.flatten(Math.max(0.02, b.height / 600));
  for (const p of whole.children) for (const s of p.segments) {
    const u = (s.point.x - b.center.x) / (b.width / 2), v = (s.point.y - b.top) / b.height;
    s.point = new paper.Point(s.point.x, s.point.y + f(u, v, A));
  }
  return whole.pathData;
}
let warpSeq = 0;
async function rebuildWarp(o, meta) {
  const my = ++warpSeq, wasActive = canvas.getActiveObject() === o;
  o._warpPending = meta;
  let d;
  try { d = await warpedOutline(meta); } catch (e) { o._warpPending = null; toast("ดัดรูปข้อความไม่ได้ — ตรวจอินเทอร์เน็ต/ฟอนต์", "err"); return; }
  if (!d || my !== warpSeq || !canvas.getObjects().includes(o)) return;
  o._warpPending = null;
  const c = o.getCenterPoint();
  const paint = { fill: isGrad(meta.fill) ? sortedStops(meta.fill)[0].color : meta.fill, stroke: meta.stroke || null, strokeWidth: meta.strokeWidth || 0, strokeUniform: true, paintFirst: meta.paintFirst || "fill" };
  const next = new fabric.Path(d, { ...paint, angle: o.angle || 0, opacity: o.opacity ?? 1, name: o.name, objectCaching: false });
  if (isGrad(meta.fill)) next.set("fill", makeGrad(next, meta.fill.type, sortedStops(meta.fill), gradAngle(meta.fill)));
  next.setPositionByOrigin(c, "center", "center");
  next.arcMeta = { ...meta, fill: meta.fill };
  const idx = canvas.getObjects().indexOf(o);
  canvas.remove(o); canvas.add(next);
  if (idx >= 0) next.moveTo(idx);
  if (clipOn) applyClip(next);
  if (wasActive) canvas.setActiveObject(next);
  fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
}

/* ---------- Type on a Path, as Illustrator's ----------
   The letters sit on the path (drawn with the pen, a line, a circle…), each
   turned with it, centred on it unless shifted; as the curved text, a group of
   letters with the text, font and path in arcMeta, so it is edited, saved and
   printed the same way. The path itself goes into arcMeta (unpainted, as
   Illustrator makes it) and comes back when the text is taken off it. */
function pathOfObject(o) {
  // its outline in canvas units, as one paper.js path
  const keep = o.clipPath; o.clipPath = null;
  let svg; try { svg = o.toSVG(); } finally { o.clipPath = keep; }
  const root = paper.project.importSVG(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, { insert: false, expandShapes: true });
  const c = root.getItems({ match: x => x instanceof paper.Path })[0];
  if (!c) return null;
  const p = c.clone({ insert: false }); p.applyMatrix = true;
  if (c.parent) p.transform(c.parent.globalMatrix);
  return p;
}
function buildOnPathGroup(meta, at) {
  const { text, fontSize, fontFamily, fontWeight, fontStyle, charSpacing, fill, stroke, strokeWidth, paintFirst } = meta;
  const path = new paper.Path({ pathData: meta.onPath.d, insert: false });
  if (meta.onPath.flip) path.reverse();
  const L = path.length;
  const chars = [...String(text || " ")];
  const common = { fontSize, fontFamily, fontWeight, fontStyle, fill, stroke, strokeWidth, paintFirst, strokeUniform: true, originX: "center", originY: "center", objectCaching: false };
  const widths = chars.map(ch => new fabric.Text(ch === " " ? " " : ch, common).width + (charSpacing || 0) / 1000 * fontSize);
  const total = widths.reduce((a, b) => a + b, 0);
  let s = (L - total) / 2 + ((meta.onPath.shift || 0) / 100) * L / 2;
  const lift = fontSize * 0.32; // the letters' baseline on the path, not their middle
  const objs = chars.map((ch, i) => {
    const mid = s + widths[i] / 2; s += widths[i];
    // past an end: straight on along the end's direction
    const at0 = Math.min(Math.max(mid, 0), L);
    const pt = path.getPointAt(at0), tan = path.getTangentAt(at0) || new paper.Point(1, 0);
    const over = mid - at0;
    const x = pt.x + tan.x * over, y = pt.y + tan.y * over;
    const ang = Math.atan2(tan.y, tan.x);
    return new fabric.Text(ch === " " ? " " : ch, { ...common, charSpacing: 0, left: x + Math.sin(ang) * lift, top: y - Math.cos(ang) * lift, angle: ang * 180 / Math.PI });
  });
  const g = new fabric.Group(objs, { objectCaching: false });
  // where it was put: the path's place, moved with the text since
  if (at) g.setPositionByOrigin(new fabric.Point(at.left, at.top), "center", "center");
  g.arcMeta = { ...meta };
  return g;
}
let pathSeq = 0;
async function rebuildOnPath(o, meta) {
  const my = ++pathSeq, wasActive = canvas.getActiveObject() === o;
  const built = o.arcMeta && o.arcMeta.onPath ? o.arcMeta : null; // what is on the canvas now
  o._warpPending = meta;
  try { await loadPaper(); } catch (e) { o._warpPending = null; toast("โหลดเครื่องมือไม่ได้ — ตรวจอินเทอร์เน็ต", "err"); return; }
  await ensureFont(meta.fontFamily, meta.fontSize, meta.fontWeight);
  if (my !== pathSeq || !canvas.getObjects().includes(o)) return;
  o._warpPending = null;
  // the path goes wherever the text has been moved since it was laid on it
  let d = meta.onPath.d;
  if (built) {
    const c = o.getCenterPoint(), oc = buildOnPathGroup(built, null).getCenterPoint();
    const pp = new paper.Path({ pathData: built.onPath.d, insert: false }); pp.translate(new paper.Point(c.x - oc.x, c.y - oc.y));
    d = pp.pathData;
  }
  const m2 = { ...meta, onPath: { ...meta.onPath, d, moved: [0, 0] } };
  const next = buildOnPathGroup(m2, null);
  next.set({ opacity: o.opacity ?? 1, name: o.name });
  const idx = canvas.getObjects().indexOf(o);
  canvas.remove(o); canvas.add(next);
  if (idx >= 0) next.moveTo(idx);
  next.setCoords(); if (clipOn) applyClip(next);
  if (wasActive) canvas.setActiveObject(next);
  fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
}
async function textOnPath() {
  const sel = canvas.getActiveObject();
  const objs = sel && sel.type === "activeSelection" ? sel._objects.slice() : [];
  const t = objs.find(o => isText(o) || (isArc(o) && !arcMetaOf(o).warp?.bend));
  const p = objs.find(o => o !== t && !isTextish(o) && o.type !== "image" && o.type !== "group");
  if (objs.length !== 2 || !t || !p) { toast("เลือกข้อความ 1 ชิ้น กับเส้น/รูปทรง 1 ชิ้น (Shift+คลิก)", "info"); return; }
  if (t.rosterTag) { toast("ชื่อ/เบอร์ที่เปลี่ยนตามรายชื่อ วางตามเส้นไม่ได้", "warn"); return; }
  try { await loadPaper(); } catch (e) { toast("โหลดเครื่องมือไม่ได้ — ตรวจอินเทอร์เน็ต", "err"); return; }
  canvas.discardActiveObject();
  const path = pathOfObject(p);
  if (!path || path.length < 1) { toast("อ่านเส้นนี้ไม่ได้", "warn"); return; }
  const meta = { ...arcMetaOf(t), curve: 0, warp: { style: "none", bend: 50 }, onPath: { d: path.pathData, shift: 0, flip: false, from: p.toObject(["name"]) } };
  await ensureFont(meta.fontFamily, meta.fontSize, meta.fontWeight);
  const g = buildOnPathGroup(meta, null);
  const idx = canvas.getObjects().indexOf(t);
  canvas.remove(t); canvas.remove(p); canvas.add(g); if (idx >= 0) g.moveTo(Math.min(idx, canvas.getObjects().length - 1));
  g.setCoords(); if (clipOn) applyClip(g);
  canvas.setActiveObject(g); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
  toast("ข้อความวิ่งตามเส้นแล้ว — เลื่อน/กลับด้าน/ถอดออก ได้ในแผงข้อความ", "ok");
}
/** the text off its path: a plain text, and the path back where the text has gone */
async function textOffPath(o) {
  const m = o.arcMeta; if (!m || !m.onPath) return;
  await loadPaper();
  const now = buildOnPathGroup(m, null);
  const dx = o.getCenterPoint().x - now.getCenterPoint().x, dy = o.getCenterPoint().y - now.getCenterPoint().y;
  const d = new paper.Path({ pathData: m.onPath.d, insert: false }); d.translate(new paper.Point(dx, dy));
  const back = await new Promise(ok => fabric.util.enlivenObjects([m.onPath.from], objs => ok(objs[0])));
  const path = back && back.type === "path" ? back : new fabric.Path(d.pathData, { fill: "", stroke: "#94a3b8", strokeWidth: 1 });
  if (back) { const c = back.getCenterPoint(); back.setPositionByOrigin(new fabric.Point(c.x + dx, c.y + dy), "center", "center"); }
  const c = o.getCenterPoint();
  const meta = { ...m, onPath: null, curve: 0 };
  const t = buildArcGroup(meta, { left: c.x, top: c.y });
  t.set({ opacity: o.opacity ?? 1, name: o.name });
  const idx = canvas.getObjects().indexOf(o);
  canvas.remove(o); canvas.add(path); canvas.add(t); if (idx >= 0) { path.moveTo(idx); t.moveTo(idx + 1); }
  [path, t].forEach(x => { x.setCoords(); if (clipOn) applyClip(x); });
  canvas.setActiveObject(t); fixBackOrder(); canvas.requestRenderAll(); refreshLayers(); syncProps(); pushHistory();
}
$("#btnTextPath").onclick = () => textOnPath();

function bindTextPanel() {
  const g = id => document.getElementById(id);
  const active = () => canvas.getActiveObject();

  const apply = patch => {
    const o = active(); if (!o || !isTextish(o)) return;

    // curving a roster field would break the batch generator (rebuilding the
    // arc replaces the object mid-loop), so drop the tag and say why
    const curving = patch.curve !== undefined ? patch.curve !== 0 : isArc(o);
    if (curving && o.rosterTag) {
      o.rosterTag = null;
      toast("ข้อความโค้งใช้เป็นช่องชื่อ/เบอร์ roster ไม่ได้\nยกเลิกแท็กให้แล้ว — ชื่อทีมโค้งไม่ต้องเปลี่ยนรายคนอยู่แล้ว", "warn");
      updateTagInfo && updateTagInfo();
    }

    // an arc or a warp must be rebuilt; a plain text can be mutated in place
    const warping = patch.warp && patch.warp.style !== "none";
    if (warping && o.rosterTag) { o.rosterTag = null; toast("ข้อความที่ดัดรูปใช้เป็นช่องชื่อ/เบอร์ไม่ได้ — ยกเลิกแท็กให้แล้ว", "warn"); updateTagInfo && updateTagInfo(); }
    if (isArc(o) || warping || (patch.curve !== undefined && patch.curve !== 0)) rebuildArc(o, patch);
    else { o.set(patch); canvas.requestRenderAll(); }
    pushHistory(); syncProps();
  };

  const weightOf = o => (isArc(o) ? arcMetaOf(o).fontWeight : o.fontWeight);
  const styleOf = o => (isArc(o) ? arcMetaOf(o).fontStyle : o.fontStyle);

  if (g("txSize")) g("txSize").onchange = e => apply({ fontSize: Math.max(4, +e.target.value || 40) });
  if (g("txBold")) g("txBold").onclick = () => { const o = active(); if (!o || !isTextish(o)) return; const w = weightOf(o); apply({ fontWeight: (w === "bold" || w === "700" || w === 700) ? "normal" : "bold" }); };
  if (g("txItal")) g("txItal").onclick = () => { const o = active(); if (!o || !isTextish(o)) return; apply({ fontStyle: styleOf(o) === "italic" ? "normal" : "italic" }); };
  if (g("txSpace")) g("txSpace").oninput = e => { const v = +e.target.value; const l = g("txSpaceV"); if (l) l.textContent = v; };
  if (g("txSpace")) g("txSpace").onchange = e => apply({ charSpacing: +e.target.value });
  if (g("txArc")) g("txArc").oninput = e => { const v = +e.target.value; const l = g("txArcV"); if (l) l.textContent = v; };
  if (g("txArc")) g("txArc").onchange = e => apply({ curve: +e.target.value });
  if (g("txText")) g("txText").onchange = e => apply({ text: e.target.value });
  // on a path: shift along it, the other side, or off it
  if (g("txPathOff")) g("txPathOff").onchange = e => { const o = active(); const m = o && arcMetaOf(o); if (m && m.onPath) apply({ onPath: { ...m.onPath, shift: +e.target.value } }); };
  if (g("txPathFlip")) g("txPathFlip").onclick = () => { const o = active(); const m = o && arcMetaOf(o); if (m && m.onPath) apply({ onPath: { ...m.onPath, flip: !m.onPath.flip } }); };
  if (g("txPathOut")) g("txPathOut").onclick = () => { const o = active(); if (o && arcMetaOf(o).onPath) textOffPath(o); };
  // a warp and the circle curve are one or the other
  if (g("txWarp")) g("txWarp").onchange = e => apply({ warp: { style: e.target.value, bend: +g("txBend").value || 50 }, curve: 0 });
  if (g("txBend")) g("txBend").oninput = e => { const l = g("txBendV"); if (l) l.textContent = e.target.value; };
  if (g("txBend")) g("txBend").onchange = e => apply({ warp: { style: g("txWarp").value, bend: +e.target.value }, curve: 0 });
  if (g("txArc")) { const was = g("txArc").onchange; g("txArc").onchange = e => { const o = active(); if (o && isArc(o) && arcMetaOf(o).warp && arcMetaOf(o).warp.style !== "none") { apply({ curve: +e.target.value, warp: { style: "none", bend: 50 } }); return; } was(e); }; }
}

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
  // a line is split before it is trimmed: a player with a number and no name is "\t12\tXL",
  // and trimming first dropped the empty name — 12 became the name and XL the number
  return raw.split(/\r?\n/).filter(l => l.trim()).map(l => {
    let parts = l.split(/\t|,|;|\|/).map(s => s.trim());
    if (parts.length === 1) {
      if (/^[0-9]{1,3}$/.test(parts[0])) return { name: "", number: parts[0], size: "" };
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
  const rows = parseRoster(); if (!rows.length) { toast("ยังไม่มีรายชื่อ", "warn"); return; }
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
      folder.file(base + ".svg", await buildOutlinedSVG(i > 0));
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
/* ---------- print data for the factory ----------
   When a team orders, the bib is printed from what this page draws, not from a
   file the graphics team re-makes. Every shape is laid down here as an outline
   (text in the very font on screen), in mm on the CB-005 piece of the size it was
   drawn on: origin at the cut line's top-left, y down. The API (bibs/designer-print.ts)
   places it on each size's pieces and builds the job a web bib gets.
   The shared art goes once; each player only carries their own name / number fields. */
const PRINT_MAX_PX = 3000;   // a picture's longest side in the print data
function mulM(A, B) { return [A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1], A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3], A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5]]; }
function applyM(m, x, y) { return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }
const r4 = n => Math.round(n * 1e4) / 1e4;
const nf = a => parseFloat(a) || 0;
/** canvas units → mm on the panel's piece (the garment sits centred on (200, 235) in sizes.js units, turned by the layout's angle) */
function panelToMm(p) {
  const sz = window.AXIOM_SIZES[TPL_SIZE];
  const bb = pathBBox(p.tpl === "front" ? sz.front : sz.back);
  const th = -(p.angle || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), U = MM_PER_UNIT;
  const toLocal = mulM([1, 0, 0, 1, 200 - bb.x, 235 - bb.y], mulM([c, s, -s, c, 0, 0], [1, 0, 0, 1, -p.cx, -p.cy]));
  return mulM([U, 0, 0, U, 0, 0], toLocal);
}
function colorHex(v) {
  try { const c = new fabric.Color(v); return c.getAlpha() === 0 ? null : "#" + c.toHex().toLowerCase(); } catch (e) { return null; }
}
/** a gradient and the ones it takes its stops and settings from (href), nearest first */
function gradChain(doc, id) {
  const chain = [];
  for (let n = doc.getElementById(id); n && chain.length < 8 && !chain.includes(n);) {
    chain.push(n);
    const h = n.getAttribute("href") || n.getAttribute("xlink:href");
    n = h && h[0] === "#" ? doc.getElementById(h.slice(1)) : null;
  }
  return chain;
}
/** a paint, as a flat colour: a gradient's first stop (the gradient itself is gradientIn's) */
function paintHex(v, el, warn) {
  if (!v || v === "none") return null;
  const u = /url\(["']?#([^"')]+)/.exec(v);
  if (u) {
    const chain = gradChain(el.ownerDocument, u[1]);
    const holder = chain.find(n => n.querySelector("stop"));
    const stop = holder && holder.querySelector("stop");
    if (!stop) warn.add("ลวดลาย (pattern) พิมพ์ไม่ได้");
    return stop ? colorHex(getComputedStyle(stop).stopColor) : null;
  }
  return colorHex(v);
}
/**
 * A gradient fill for the print (draw.ts Grad): linear or radial, its stops,
 * and the matrix from its own space to mm on the piece, from the gradient's
 * units (the shape's box, or its user space) and gradientTransform. Null when
 * the paint isn't one.
 */
function gradientIn(el, svg, v, toMm, warn) {
  const u = /url\(["']?#([^"')]+)/.exec(v || ""); if (!u) return null;
  const chain = gradChain(el.ownerDocument, u[1]), g = chain[0]; if (!g) return null;
  const tag = g.tagName.toLowerCase(), type = tag === "lineargradient" ? "linear" : tag === "radialgradient" ? "radial" : null;
  if (!type) return null;
  const attr = n => { for (const x of chain) if (x.hasAttribute(n)) return x.getAttribute(n); return null; };
  const holder = chain.find(x => x.querySelector("stop")); if (!holder) return null;
  const stops = []; let last = 0;
  for (const s of holder.querySelectorAll("stop")) {
    const ov = s.getAttribute("offset") || "0", st = getComputedStyle(s), c = colorHex(st.stopColor);
    const o = Math.min(1, Math.max(last, /%$/.test(ov) ? parseFloat(ov) / 100 : parseFloat(ov) || 0));
    if (!c) continue;
    if (parseFloat(st.stopOpacity) < 0.999) warn.add("ไล่สีที่จางเป็นโปร่งใสพิมพ์เป็นสีทึบ");
    stops.push({ o: r4(o), c }); last = o;
  }
  if (!stops.length) return null;
  if ((attr("spreadMethod") || "pad") !== "pad") warn.add("ไล่สีแบบวนซ้ำ (repeat/reflect) พิมพ์แบบต่อสีปลาย");
  let bb; try { bb = el.getBBox(); } catch (e) { return null; }
  if (!(bb.width > 0 && bb.height > 0)) return null;
  const onBox = (attr("gradientUnits") || "objectBoundingBox") === "objectBoundingBox";
  // a length: a fraction of the box (objectBoundingBox, or a % in user space), else user units
  const L = (n, d, axis) => {
    const s = attr(n); const pct = s == null ? d : /%$/.test(s) ? parseFloat(s) / 100 : null;
    if (onBox) return pct != null ? pct : parseFloat(s);
    if (pct == null) return parseFloat(s);
    return axis === "x" ? bb.x + pct * bb.width : axis === "y" ? bb.y + pct * bb.height : pct * Math.hypot(bb.width, bb.height) / Math.SQRT2;
  };
  let coords;
  if (type === "linear") coords = [L("x1", 0, "x"), L("y1", 0, "y"), L("x2", 1, "x"), L("y2", 0, "y")];
  else {
    const cx = L("cx", 0.5, "x"), cy = L("cy", 0.5, "y");
    coords = [cx, cy, L("r", 0.5, "r"), attr("fx") != null ? L("fx", 0.5, "x") : cx, attr("fy") != null ? L("fy", 0.5, "y") : cy];
  }
  if (coords.some(n => !isFinite(n))) return null;
  const ctm = el.getCTM(); if (!ctm) return null;
  let m = mulM(toMm, [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f]);
  if (onBox) m = mulM(m, [bb.width, 0, 0, bb.height, bb.x, bb.y]);
  const tEl = chain.find(x => x.hasAttribute("gradientTransform"));
  const t = tEl && tEl.gradientTransform && tEl.gradientTransform.baseVal.consolidate();
  if (t) m = mulM(m, [t.matrix.a, t.matrix.b, t.matrix.c, t.matrix.d, t.matrix.e, t.matrix.f]);
  return { type, coords: coords.map(r4), stops, m: m.map(r4) };
}
function ellipseD(cx, cy, rx, ry) {
  const k = 0.5522847498, ox = rx * k, oy = ry * k;
  return `M${cx - rx} ${cy}C${cx - rx} ${cy - oy} ${cx - ox} ${cy - ry} ${cx} ${cy - ry}C${cx + ox} ${cy - ry} ${cx + rx} ${cy - oy} ${cx + rx} ${cy}C${cx + rx} ${cy + oy} ${cx + ox} ${cy + ry} ${cx} ${cy + ry}C${cx - ox} ${cy + ry} ${cx - rx} ${cy + oy} ${cx - rx} ${cy}Z`;
}
function rectD(x, y, w, h, rx, ry) {
  if (!(rx > 0 || ry > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
  const k = 0.5522847498, ox = rx * k, oy = ry * k;
  return `M${x + rx} ${y}H${x + w - rx}C${x + w - rx + ox} ${y} ${x + w} ${y + ry - oy} ${x + w} ${y + ry}V${y + h - ry}C${x + w} ${y + h - ry + oy} ${x + w - rx + ox} ${y + h} ${x + w - rx} ${y + h}H${x + rx}C${x + rx - ox} ${y + h} ${x} ${y + h - ry + oy} ${x} ${y + h - ry}V${y + ry}C${x} ${y + ry - oy} ${x + rx - ox} ${y} ${x + rx} ${y}Z`;
}
/** any path data → absolute M/L/C/Q/Z only (arcs become curves), as the API reads it */
function simplePathD(d) {
  const cmds = fabric.util.makePathSimpler(fabric.util.parsePath(d));
  return cmds.map(c => c[0] + c.slice(1).map(n => r4(n)).join(" ")).join("");
}
function geometryD(el) {
  const t = el.tagName.toLowerCase(), A = n => nf(el.getAttribute(n));
  if (t === "path") { const d = el.getAttribute("d"); return d ? simplePathD(d) : ""; }
  if (t === "rect") return rectD(A("x"), A("y"), A("width"), A("height"), A("rx"), A("ry"));
  if (t === "circle") return ellipseD(A("cx"), A("cy"), A("r"), A("r"));
  if (t === "ellipse") return ellipseD(A("cx"), A("cy"), A("rx"), A("ry"));
  if (t === "line") return `M${A("x1")} ${A("y1")}L${A("x2")} ${A("y2")}`;
  if (t === "polyline" || t === "polygon") {
    const n = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    if (n.length < 4) return "";
    let d = `M${n[0]} ${n[1]}`; for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
    return t === "polygon" ? d + "Z" : d;
  }
  return "";
}
/** a picture as a PNG (base64) no bigger than PRINT_MAX_PX, shared by index */
async function printImage(href, images, seen) {
  if (seen.has(href)) return seen.get(href);
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = href;
  await img.decode();
  const k = Math.min(1, PRINT_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  let b64;
  if (k === 1 && /^data:image\/png;base64,/.test(href)) b64 = href.slice(href.indexOf(",") + 1);
  else {
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    b64 = c.toDataURL("image/png").split(",")[1];
  }
  images.push(b64); seen.set(href, images.length - 1);
  return images.length - 1;
}
/** path data moved by a matrix, as absolute M/L/C/Q/Z */
function transformD(d, m) {
  return fabric.util.makePathSimpler(fabric.util.parsePath(d)).map(c => {
    if (c[0] === "Z" || c[0] === "z") return "Z";
    const pts = [];
    for (let i = 1; i + 1 < c.length; i += 2) { const [x, y] = applyM(m, c[i], c[i + 1]); pts.push(r4(x), r4(y)); }
    return c[0] + pts.join(" ");
  }).join("");
}
/** the artwork's own clip on an element (a logo's clip path, a cropped picture), in mm on the piece; null when none */
function clipInMm(el, svg, toMm) {
  for (let n = el; n && n !== svg; n = n.parentElement) {
    const ref = n.getAttribute && n.getAttribute("clip-path");
    const id = ref && (/url\(["']?#([^"')]+)/.exec(ref) || [])[1];
    if (!id) continue;
    const cp = svg.querySelector("#" + CSS.escape(id));
    const base = n.getCTM();
    if (!cp || !base) return null;
    let d = "";
    for (const c of cp.querySelectorAll("path,rect,circle,ellipse,polygon,polyline")) {
      const g = geometryD(c); if (!g) continue;
      const own = c.transform && c.transform.baseVal.consolidate();
      const cm = own ? own.matrix : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      d += transformD(g, mulM(toMm, mulM([base.a, base.b, base.c, base.d, base.e, base.f], [cm.a, cm.b, cm.c, cm.d, cm.e, cm.f])));
    }
    return d || null;
  }
  return null;
}
/** the panels an object reaches (a band across the front and back prints on both), else the one it is nearest */
function panelsOf(o) {
  const br = o.getBoundingRect(true, true);
  const hit = panels.map((p, i) => [p, i]).filter(([p]) => br.left < p.x + p.w && br.left + br.width > p.x && br.top < p.y + p.h && br.top + br.height > p.y).map(([, i]) => i);
  return hit.length ? hit : [panelOf(o)];
}
/** one fabric object as print items, in mm on a panel's piece (its own, or the one given) */
async function printObj(o, ctx, onPanel) {
  const pi = onPanel ?? panelOf(o), p = panels[pi], toMm = panelToMm(p);
  // the editor's own clip to the garment isn't the artwork's: the job clips to the cut line itself
  const garmentClip = o.clipPath; o.clipPath = null;
  let svgText;
  try { svgText = o.toSVG(); } finally { o.clipPath = garmentClip; }
  const r = await outlineSVG(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10">${svgText}</svg>`);
  r.skipped.forEach(f => ctx.fail.add(`ฟอนต์ ${f}`));
  ctx.host.innerHTML = r.svg;
  const svg = ctx.host.querySelector("svg");
  const items = [];
  for (const el of svg ? svg.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,image") : []) {
    if (el.closest("clipPath,defs,mask,pattern,marker,symbol")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let op = 1;
    for (let n = el; n && n !== svg; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); op *= isNaN(v) ? 1 : v; }
    if (op <= 0) continue;
    const ctm = el.getCTM(); if (!ctm) continue;
    const m = mulM(toMm, [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f]);
    if (el.tagName.toLowerCase() === "image") {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href"); if (!href) continue;
      const w = nf(el.getAttribute("width")), h = nf(el.getAttribute("height")); if (!w || !h) continue;
      try {
        const idx = await printImage(href, ctx.images, ctx.seen);
        const crop = clipInMm(el, svg, toMm);
        items.push({ img: idx, m: mulM(m, [w, 0, 0, h, nf(el.getAttribute("x")), nf(el.getAttribute("y"))]).map(r4), ...(crop ? { clip: crop } : {}), ...(op < 0.999 ? { op: r4(op) } : {}) });
      } catch (e) { ctx.fail.add("รูปที่โหลดไม่ได้"); }
      continue;
    }
    const d = geometryD(el); if (!d) continue;
    const fill = parseFloat(cs.fillOpacity) === 0 ? null : paintHex(cs.fill, el, ctx.warn);
    const stroke = parseFloat(cs.strokeOpacity) === 0 ? null : paintHex(cs.stroke, el, ctx.warn);
    const sw = nf(cs.strokeWidth);
    const it = { d, m: m.map(r4) };
    if (fill && !/^(line|polyline)$/i.test(el.tagName)) {
      it.fill = fill;
      const g = gradientIn(el, svg, cs.fill, toMm, ctx.warn);
      if (g) it.grad = g;
    }
    if (stroke && /url\(/.test(cs.stroke)) ctx.warn.add("เส้นขอบไล่สีพิมพ์เป็นสีเดียว");
    if (stroke && sw > 0) {
      it.stroke = stroke; it.sw = r4(sw);
      const lj = String(cs.strokeLinejoin || "miter");
      if (lj === "miter" || lj === "bevel") { it.join = lj; if (lj === "miter") it.ml = Math.min(100, Math.max(1, parseFloat(cs.strokeMiterlimit) || 4)); }
      const dash = String(cs.strokeDasharray || "").split(/[\s,]+/).map(parseFloat).filter(v => v >= 0);
      if (dash.length && dash.some(v => v > 0)) it.dash = (dash.length % 2 ? dash.concat(dash) : dash).map(r4);
    }
    if (!it.fill && !it.stroke) continue;
    if (cs.fillRule === "evenodd") it.eo = true;
    // see-through: the object's and its groups', times the paint's own
    const fo = parseFloat(cs.fillOpacity), so = parseFloat(cs.strokeOpacity);
    const seeFill = op * (isNaN(fo) ? 1 : fo), seeStroke = op * (isNaN(so) ? 1 : so);
    const see = it.fill ? seeFill : seeStroke;
    if (see < 0.999) it.op = r4(see);
    const clip = clipInMm(el, svg, toMm);
    if (clip) it.clip = clip;
    // a keyline drawn under the fill (Fabric's paintFirst "stroke"): two shapes, the stroke first
    if (it.fill && it.stroke && /^stroke/.test(String(cs.paintOrder || ""))) {
      const { fill: f, grad: g0, op: o0, ...under } = it;
      if (seeStroke < 0.999) under.op = r4(seeStroke);
      items.push(under);
      const { stroke: s1, sw: s2, dash: s3, join: s4, ml: s5, ...over } = it;
      items.push(over);
      continue;
    }
    items.push(it);
  }
  ctx.host.innerHTML = "";
  // its centre and size on the piece, to carry it to the other sizes
  const br = o.getBoundingRect(true, true);
  const pts = [[br.left, br.top], [br.left + br.width, br.top], [br.left, br.top + br.height], [br.left + br.width, br.top + br.height]].map(([x, y]) => applyM(toMm, x, y));
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { panel: pi, c: [r4((x0 + x1) / 2), r4((y0 + y1) / 2)], w: r4(x1 - x0), h: r4(y1 - y0), ...(isTextish(o) ? { text: true } : {}), items };
}
/* A player's name or number set in the template's size can be wider than the piece
   (a long name across the back): it shrinks, about its centre, to sit inside the
   piece's own outline at its height, clear of the trim — as the bib designer fits names.
   Only for that player's print data; the template keeps its size. */
// the trim band along the armholes is up to 20 mm wide: names keep 15 mm clear of it (as bibs/designer-print.ts)
const FIT_MARGIN_MM = 35;
const outlineCache = new Map();
/** the piece's outline as points, in sizes.js units (centred on 200, 235) */
function pieceOutline(tpl) {
  const key = TPL_SIZE + "|" + tpl;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const sz = window.AXIOM_SIZES[TPL_SIZE], d = tpl === "front" ? sz.front : sz.back;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.style.position = "absolute";
  path.setAttribute("d", d); svg.appendChild(path); document.body.appendChild(svg);
  const L = path.getTotalLength(), pts = [];
  for (let i = 0; i < 900; i++) { const q = path.getPointAtLength(i / 900 * L); pts.push({ x: q.x, y: q.y }); }
  svg.remove();
  outlineCache.set(key, pts);
  return pts;
}
/** shrinks a text to fit inside its piece; returns how to put it back */
function fitInPiece(o) {
  const p = panels[panelOf(o)];
  if (!p || p.angle) return () => {};
  const pts = pieceOutline(p.tpl), m = FIT_MARGIN_MM / MM_PER_UNIT;
  const br = o.getBoundingRect(true, true);
  const toX = X => X - p.cx + 200, toY = Y => Y - p.cy + 235;
  const y0 = toY(br.top), y1 = toY(br.top + br.height), cx = toX(br.left + br.width / 2);
  // the outer edges across the text's height: the narrowest place it has to pass
  let left = -Infinity, right = Infinity;
  for (let y = y0; y <= y1 + 0.01; y += Math.max(1, (y1 - y0) / 8)) {
    const near = pts.filter(q => Math.abs(q.y - y) < 2.5);
    const l = near.filter(q => q.x < 200), r = near.filter(q => q.x > 200);
    if (!l.length || !r.length) continue;
    left = Math.max(left, Math.min(...l.map(q => q.x)));
    right = Math.min(right, Math.max(...r.map(q => q.x)));
  }
  if (!isFinite(left) || !isFinite(right)) return () => {};
  const half = Math.min(cx - (left + m), (right - m) - cx);
  const k = half > 0 ? (2 * half) / br.width : 1;
  if (k >= 1) return () => {};
  const c = o.getCenterPoint(), sx = o.scaleX, sy = o.scaleY;
  o.set({ scaleX: sx * k, scaleY: sy * k }); o.setPositionByOrigin(c, "center", "center"); o.setCoords();
  return () => { o.set({ scaleX: sx, scaleY: sy }); o.setPositionByOrigin(c, "center", "center"); o.setCoords(); };
}
/** the whole order's print data: { spec, warnings } or { error } */
async function buildPrintSpec(rows, onProgress) {
  if (!window.AXIOM_SIZES || !window.AXIOM_SIZES[TPL_SIZE]) return { error: "ไม่พบแพทเทิร์นของไซซ์นี้" };
  if (curLayout === "horizontal") return { error: "สลับกลับเป็นแนวตั้งก่อนสั่งผลิต" };
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none"; // not visibility: it is inherited, and hidden shapes are skipped
  document.body.appendChild(host);
  const ctx = { host, images: [], seen: new Map(), warn: new Set(), fail: new Set() };
  const nameObjs = taggedObjs("name"), numObjs = taggedObjs("number");
  const tagged = [...nameObjs, ...numObjs];
  const savedN = nameObjs.map(o => o.text), savedM = numObjs.map(o => o.text);
  try {
    const specPanels = panels.map(p => ({ side: String(p.id).startsWith("inner") ? "B" : "A", part: p.tpl, objs: [] }));
    for (const o of userObjects()) {
      if (tagged.includes(o) || o.visible === false) continue;
      for (const pi of panelsOf(o)) {
        const { panel, ...obj } = await printObj(o, ctx, pi);
        if (obj.items.length) specPanels[panel].objs.push(obj);
      }
    }
    const players = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      applyRow(nameObjs, numObjs, r);
      const objs = [];
      for (const o of tagged) {
        if (o.visible === false || !o.text) continue;
        if (o.initDimensions) o.initDimensions();
        o.setCoords();
        const putBack = fitInPiece(o);
        let po;
        try { po = await printObj(o, ctx); } finally { putBack(); }
        if (po.items.length) objs.push(po);
      }
      players.push({ name: r.name || "", number: r.number || "", size: (r.size || TPL_SIZE).toUpperCase(), objs });
      if (onProgress) onProgress(i + 1, rows.length);
    }
    if (ctx.fail.size) return { error: `เตรียมไฟล์ผลิตไม่ได้: ${[...ctx.fail].join(", ")} — ใช้ฟอนต์ในรายการของโปรแกรมแทน หรือถ้าเป็นตัวหนังสือในโลโก้ที่นำเข้า ให้แปลงเป็นเส้น (Create Outlines) ในไฟล์โลโก้ก่อนนำเข้า` };
    const spec = {
      app: "axiom-print", v: 1, size: TPL_SIZE, reversible: curStyle === 2, team: orderName().slice(0, 80),
      body: colorHex(bodyColor) || "#ffffff", trimColor: colorHex(trimColor) || "#ffffff",
      trim: curTrim, images: ctx.images, panels: specPanels, players,
    };
    if (bodyPatternSrc) spec.pattern = await printImage(bodyPatternSrc, ctx.images, ctx.seen);
    // an R-bib's inside in a colour / pattern of its own
    if (curStyle === 2 && sideB) {
      spec.bodyB = colorHex(sideB.color) || "#ffffff";
      spec.patternB = sideB.pat ? await printImage(sideB.pat, ctx.images, ctx.seen) : -1;
    }
    if (Object.keys(customInks).length) spec.inks = customInks;
    return { spec, warnings: [...ctx.warn] };
  } catch (e) {
    return { error: "เตรียมไฟล์ผลิตไม่สำเร็จ: " + ((e && e.message) || e) };
  } finally {
    nameObjs.forEach((o, i) => o.set("text", savedN[i]));
    numObjs.forEach((o, i) => o.set("text", savedM[i]));
    if (clipOn) reclipAll();
    canvas.requestRenderAll();
    host.remove();
  }
}
async function saveOrder(goOrder) {
  const rows = parseRoster();
  if (!taggedObjs("name").length && !taggedObjs("number").length) { toast("แท็กช่องชื่อ/เบอร์ก่อนบันทึก", "warn"); return; }
  if (!rows.length) { toast("ยังไม่มีรายชื่อ", "warn"); return; }
  const orderDoc = { app: "axiom-roster", version: 1, name: orderName(), style: curStyle, size: TPL_SIZE, roster: rows, template: getDoc(), savedAt: new Date().toISOString() };
  const preview = exportPNG(0.5);
  const prog = document.getElementById("rosterProg");
  if (inFrame() && isLoggedIn) {
    // the factory prints from this page's own drawing: lay it down as print data first
    if (prog) prog.textContent = "กำลังเตรียมไฟล์ผลิต...";
    const built = await buildPrintSpec(rows, (i, n) => { if (prog) prog.textContent = `กำลังเตรียมไฟล์ผลิต ${i}/${n}`; });
    if (built.error) {
      if (prog) prog.textContent = "";
      toast(built.error, "err");
      if (goOrder) return;
    } else if (built.warnings.length) toast("หมายเหตุไฟล์ผลิต: " + built.warnings.join(" · "), "warn");
    window.parent.postMessage({
      type: "axiom-save-order",
      payload: {
        name: orderName(), style: curStyle, size: TPL_SIZE, count: rows.length, doc: orderDoc, preview,
        goOrder: !!goOrder,
        print: built.spec || null,
        fabric: curFabric, trim: curTrim, reversible: curStyle === 2,
        roster: rows.map(r => ({ playerName: r.name || "", number: r.number || "", size: (r.size || TPL_SIZE).toUpperCase() })),
      },
    }, "*");
    if (prog) prog.textContent = goOrder ? "กำลังไปหน้าสั่งผลิต..." : "กำลังบันทึกออเดอร์...";
    toast(goOrder ? "กำลังไปหน้าสั่งผลิต..." : "กำลังบันทึกออเดอร์...", "info");
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
  // every column kept, empty or not: a column left out moves the ones after it
  if (rt) rt.value = wizRows.filter(r => r.name || r.number).map(r => [r.name || "", r.number || "", r.size || TPL_SIZE].join("\t")).join("\n");
  updateRosterCount();
}
function wizEsc(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;"); }
function updateWizCount() { const el = document.getElementById("wizCount"); if (el) { const n = wizRows.filter(r => r.name || r.number).length; el.textContent = n ? `รวม ${n} คน` : "ยังไม่มีรายชื่อ"; } }
function renderWizTable(body) {
  const rows = wizRows.map((r, i) => `<tr>
    <td style="padding:2px"><input data-wr="${i}" data-wf="name" value="${wizEsc(r.name)}" placeholder="ชื่อ" style="width:100%"></td>
    <td style="padding:2px;width:60px"><input data-wr="${i}" data-wf="number" value="${wizEsc(r.number)}" placeholder="เบอร์" style="width:100%"></td>
    <td style="padding:2px;width:60px"><select data-wr="${i}" data-wf="size" style="width:100%">${Object.keys(window.AXIOM_SIZES || { S: 1, M: 1, L: 1, XL: 1 }).map(s => `<option ${(r.size || TPL_SIZE) === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
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
    // split before trimming: an Excel row with an empty name starts with a tab
    const parsed = (document.getElementById("wizPaste").value || "").split(/\r?\n/).filter(l => l.trim()).map(l => { const p = l.split(/\t|,|;/).map(s => s.trim()); return { name: p[0] || "", number: p[1] || "", size: (p[2] || TPL_SIZE).toUpperCase() }; });
    if (parsed.length) { wizRows = parsed; renderWizTable(body); }
  };
  updateWizCount();
}
function renderWizard() {
  const stepsEl = document.getElementById("wizSteps");
  if (stepsEl) stepsEl.innerHTML = WIZ_STEPS.map((s, i) => `<div style="flex:1;text-align:center;font-size:10.5px;padding:7px 2px;border-radius:6px;background:${i + 1 === wizStep ? "#f26522" : "var(--panel2)"};color:${i + 1 === wizStep ? "#0d0e10" : "var(--muted)"};font-weight:${i + 1 === wizStep ? "700" : "400"}">${i + 1}. ${s}</div>`).join("");
  const body = document.getElementById("wizBody"); if (!body) return;
  if (wizStep === 1) {
    body.innerHTML = `<label style="font-size:12px;color:var(--muted)">ชื่อออเดอร์/ทีม</label>
      <input type="text" id="wizName" value="${wizEsc(wizName)}" placeholder="เช่น SAKURAGI ทีม A" style="width:100%;box-sizing:border-box;margin:6px 0 14px">
      <label style="font-size:12px;color:var(--muted)">รูปแบบชื่อ-เบอร์บนเสื้อ</label>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">${WIZ_LAYOUTS.map(l => `<label style="display:flex;gap:9px;align-items:flex-start;padding:10px;border:1.5px solid ${wizLayout === l.id ? "#f26522" : "var(--line2)"};border-radius:9px;cursor:pointer"><input type="radio" name="wizLo" value="${l.id}" ${wizLayout === l.id ? "checked" : ""} style="margin-top:2px"><span><b style="font-size:13px">${l.label}</b><br><span style="font-size:11.5px;color:var(--muted)">${l.desc}</span></span></label>`).join("")}</div>`;
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
      <button class="mini" id="wizGen" style="width:100%;box-sizing:border-box;height:40px;margin-bottom:8px;font-weight:700">⚙ สร้างทั้งทีม → ดาวน์โหลด ZIP</button>
      <button class="mini" id="wizOrder" style="width:100%;box-sizing:border-box;height:44px;margin-bottom:8px;background:#f26522;color:#0d0e10;border-color:transparent;font-weight:700;font-size:13.5px">🧵 สั่งผลิตเลย → ดูราคา</button>
      <button class="mini" id="wizSave" style="width:100%;box-sizing:border-box;height:34px">💾 บันทึกไว้ก่อน (ยังไม่สั่ง)</button>
      <div id="wizProg" style="font-size:11.5px;color:var(--muted);margin-top:10px"></div>`;
    const g = document.getElementById("wizGen"); if (g) g.onclick = async () => { const pr = document.getElementById("wizProg"); if (pr) pr.textContent = "กำลังสร้าง..."; await generateBatch(); const rp = document.getElementById("rosterProg"); if (pr) pr.textContent = rp ? rp.textContent : "เสร็จ ✓"; };
    const s = document.getElementById("wizSave"); if (s) s.onclick = () => { const pr = document.getElementById("wizProg"); if (pr) pr.textContent = "กำลังบันทึก..."; saveOrder(false); };
    const od = document.getElementById("wizOrder"); if (od) od.onclick = () => { const pr = document.getElementById("wizProg"); if (pr) pr.textContent = "กำลังไปหน้าสั่งผลิต..."; saveOrder(true); };
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
  if (g("rosterSave")) g("rosterSave").onclick = () => saveOrder(false);
  if (g("rosterOrder")) g("rosterOrder").onclick = () => saveOrder(true);
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
bindFontImport();
bindTextPanel();
// a saved design may open before its webfonts arrive — re-measure the curves then
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { reflowArcs(); canvas.requestRenderAll(); });
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
