"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import WireScene from "../../components/WireScene";
import JerseyHero from "../../components/JerseyHero";
import "./showcase.css";

/**
 * Cinematic, scroll-driven landing (inspired by the "Terminal" reference video)
 * adapted for Axiom Siam. Kept separate at /showcase — the original landing at
 * "/" is untouched.
 */
export default function ShowcasePage() {
  const [navSolid, setNavSolid] = useState(false);
  const pinRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [pinP, setPinP] = useState(0);

  // sticky-nav background + pinned-section scroll progress
  useEffect(() => {
    const onScroll = () => {
      setNavSolid(window.scrollY > 40);
      const pin = pinRef.current;
      if (pin) {
        const rect = pin.getBoundingClientRect();
        const total = pin.offsetHeight - window.innerHeight;
        const p = Math.max(0, Math.min(1, -rect.top / total));
        progressRef.current = p;
        setPinP(p);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // reveal-on-scroll for [.rvl] elements
  useEffect(() => {
    const io = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add("on"); }),
      { threshold: 0.2 },
    );
    document.querySelectorAll(".rvl").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // headline that fills in word-by-word across the pinned section
  const WORDS = ["จาก", "ดีไซน์", "บนจอ", "สู่", "สนาม", "จริง"];
  const lit = Math.floor(pinP * (WORDS.length + 1.5));

  return (
    <div className="sc">
      {/* NAV */}
      <nav className={`sc-nav${navSolid ? " solid" : ""}`}>
        <Link href="/showcase" className="sc-brand">
          <img src="/models/axiom-logo-white.png" alt="" />AXIOM SIAM
        </Link>
        <div className="sc-links">
          <a href="#craft">งานฝีมือ</a>
          <a href="#platform">แพลตฟอร์ม</a>
          <Link href="/templates">ตลาดลาย</Link>
          <Link href="/design">ออกแบบ</Link>
        </div>
        <div className="sc-cta">
          <Link href="/login" className="sc-btn ghost">เข้าสู่ระบบ</Link>
          <Link href="/design" className="sc-btn solid">เริ่มออกแบบ</Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="sc-hero sc-sec">
        <JerseyHero />
        <h1>ชุดกีฬาที่โรงงานไทยภูมิใจ</h1>
        <p>OEM / ODM เสื้อกีฬาครบวงจร — ออกแบบเองบนเว็บ ใส่ชื่อ-เบอร์ทั้งทีม เห็นราคาทันที แล้วสั่งผลิตจบในที่เดียว</p>
        <div className="sc-hero-cta">
          <Link href="/design" className="sc-btn solid">🎨 ออกแบบเสื้อเอง</Link>
          <Link href="/templates" className="sc-btn ghost">ดูตลาดลาย</Link>
        </div>
        <div className="sc-scrollcue">เลื่อนลง ↓</div>
      </header>

      {/* PINNED 3D FIELD + word reveal */}
      <section className="sc-pin" ref={pinRef}>
        <div className="sc-pin-stick">
          <WireScene progressRef={progressRef} />
          <div className="sc-pin-copy">
            <h2>
              {WORDS.map((w, i) => (
                <span key={i} className={`sc-word${i < lit ? " on" : ""}${w === "จริง" ? " hl" : ""}`}>{w}</span>
              ))}
            </h2>
          </div>
        </div>
      </section>

      {/* GRID WORD */}
      <section className="sc-grid sc-sec" id="craft">
        <div className="sc-grid-bg" />
        <h2 className="rvl">ฝีมือ.</h2>
      </section>

      {/* DARK -> LIGHT FEATURE */}
      <section className="sc-reveal sc-sec">
        <div className="eyebrow rvl">ผลงานจริง</div>
        <h2 className="rvl">พิมพ์สกรีนคมชัด ทุกดีเทลตรงแบบ</h2>
        <div className="sc-cards">
          {[
            { img: "/portfolio/ex_01.png", t: "ฟุตบอลทีมชาติ", d: "ลายไล่เฉด สีสด พิมพ์เต็มตัว" },
            { img: "/portfolio/ex_02.png", t: "บาสเกตบอล", d: "ผ้าตาข่ายระบายอากาศ เบอร์ใหญ่ชัด" },
            { img: "/portfolio/ex_03.png", t: "วิ่ง / มาราธอน", d: "เนื้อเบา แห้งไว โลโก้สปอนเซอร์คมกริบ" },
            { img: "/portfolio/ex_04.png", t: "เสื้อทีมองค์กร", d: "ขลิบเนี้ยบ งานสั่งผลิตจำนวนมาก" },
          ].map((c, i) => (
            <div className="sc-card rvl" key={i} style={{ transitionDelay: `${i * 80}ms` }}>
              <div className="thumb"><img src={c.img} alt={c.t} /></div>
              <div className="body"><h3>{c.t}</h3><p>{c.d}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* SPLIT copy + data panel */}
      <section className="sc-split sc-sec" id="platform">
        <div className="sc-split-l">
          <h2 className="rvl">ครบจบในแพลตฟอร์มเดียว</h2>
          <p className="rvl">ตั้งแต่ออกแบบ ใส่รายชื่อทีม คิดราคา ชำระเงิน ไปจนถึงติดตามการผลิตและเลขพัสดุ — ไม่ต้องสลับหลายแอป</p>
          <ul>
            <li className="rvl"><b>✓</b> ออกแบบเองบนเว็บ + ตัวหนังสือโค้ง 28 ฟอนต์</li>
            <li className="rvl"><b>✓</b> ใส่ชื่อ-เบอร์ทั้งทีมจาก Excel วางทีเดียว</li>
            <li className="rvl"><b>✓</b> คิดราคาขั้นบันไดอัตโนมัติ เห็นก่อนสั่ง</li>
            <li className="rvl"><b>✓</b> จ่ายผ่านบัตร/PromptPay แล้วตามสถานะผลิตได้</li>
          </ul>
        </div>
        <div className="sc-split-r">
          <div className="sc-bars">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <i key={i} style={{ height: `${40 + i * 10}%`, animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="sc-final sc-sec">
        <h2 className="rvl">พร้อมทำชุดทีมของคุณหรือยัง?</h2>
        <p className="rvl">เริ่มออกแบบฟรีในไม่กี่คลิก — จ่ายเมื่อพอใจ</p>
        <div className="rvl" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/design" className="sc-btn solid" style={{ padding: "14px 30px", fontSize: 15 }}>🎨 เริ่มออกแบบเลย</Link>
          <Link href="/" className="sc-btn ghost" style={{ padding: "14px 30px", fontSize: 15 }}>กลับหน้าเดิม</Link>
        </div>
      </section>

      <footer className="sc-foot">© {new Date().getFullYear()} Axiom Siam Co.,Ltd. · ผู้ผลิตชุดกีฬา OEM/ODM</footer>
    </div>
  );
}
