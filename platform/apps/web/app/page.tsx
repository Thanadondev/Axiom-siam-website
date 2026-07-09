"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../lib/auth-context";
import LandingScene from "../components/LandingScene";
import UserMenu from "../components/UserMenu";
import "./landing.css";

type Theme = "light" | "dark";

export default function Home() {
  const [lang, setLang] = useState<"th" | "en">("th");
  const [theme, setTheme] = useState<Theme>("light");
  const { user } = useAuth();
  const th = lang === "th";
  const designHref = "/design";
  const logoMark = theme === "light" ? "/logo-mark-blue.png" : "/logo-mark.png";
  const logoFull = theme === "light" ? "/logo-blue.png" : "/logo.png";

  const team = [
    { icon: "👑", name: th ? "คุณสมชาย ว." : "Somchai W.", role: th ? "ผู้ก่อตั้ง & กรรมการผู้จัดการ" : "Founder & Managing Director" },
    { icon: "🏭", name: th ? "คุณวิภา ส." : "Wipha S.", role: th ? "ผู้จัดการฝ่ายผลิต" : "Production Manager" },
    { icon: "🎨", name: th ? "คุณธนา ก." : "Thana K.", role: th ? "หัวหน้าทีมออกแบบ" : "Design Lead" },
    { icon: "🤝", name: th ? "คุณนภา จ." : "Napha J.", role: th ? "ฝ่ายลูกค้าสัมพันธ์" : "Client Relations" },
  ];

  return (
    <div className={`landing lang-${lang} theme-${theme}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Anton&family=Sora:wght@400;600;700;800&family=Noto+Sans+Thai:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <LandingScene theme={theme} />

      <div className="topbar">
        <div className="brand">
          <img src={logoMark} alt="AXIOM SIAM" style={{ height: 40, width: "auto", display: "block" }} />
          <div>
            <b>AXIOM SIAM</b>
            <span>Co.,Ltd.</span>
          </div>
        </div>
        <div className="nav">
          <Link className="ghost" href="/templates">
            🛍️ {th ? "ตลาดลาย" : "Templates"}
          </Link>
          <Link className="solid" href={designHref}>
            🎨 {th ? "ออกแบบเสื้อเอง" : "Design Your Own"}
          </Link>
          <UserMenu loginClass="ghost" />
          <div className="pill" title="ธีมสี">
            <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")} aria-label="ธีมขาว-น้ำเงิน">☀</button>
            <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")} aria-label="ธีมดำ-มิ้นต์">🌙</button>
          </div>
          <div className="pill">
            <button className={th ? "on" : ""} onClick={() => setLang("th")}>TH</button>
            <button className={!th ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
        </div>
      </div>

      <div className="dots" id="dots" />

      <main>
        <section className="sec center" data-step="0">
          <div className="box">
            <div className="eyebrow">Sportswear Manufacturer · OEM / ODM</div>
            <h1>
              {th ? (
                <>โรงงานผลิต<br />เสื้อผ้ากีฬาครบวงจร</>
              ) : (
                <>Full-Service<br />Sportswear Manufacturer</>
              )}
            </h1>
            <p>
              {th
                ? "รับผลิตเสื้อกีฬาคุณภาพส่งออก ทั้งในประเทศและต่างประเทศ ด้วยมาตรฐานการผลิตระดับสากลและทีมงานมืออาชีพ"
                : "Export-quality sportswear production for local and international markets, built on world-class standards and a professional team."}
            </p>
            <div className="btnrow" style={{ justifyContent: "center" }}>
              <Link className="btn solid" href={designHref}>{th ? "เริ่มออกแบบเสื้อ" : "Start Designing"}</Link>
              <a className="btn ghost" href="#contact">{th ? "ขอใบเสนอราคา" : "Get a Quote"}</a>
            </div>
          </div>
          <div className="scrollhint">
            <div className="m" />
            <span>{th ? "เลื่อนลง" : "Scroll"}</span>
          </div>
        </section>

        <section className="sec" data-step="1">
          <div className="box">
            <div className="eyebrow">About Us</div>
            <h2>{th ? "เกี่ยวกับ Axiom Siam" : "About Axiom Siam"}</h2>
            <p>
              {th
                ? "เราคือผู้ผลิตเสื้อผ้ากีฬาครบวงจร เชี่ยวชาญงานตัดเย็บคุณภาพสูง ใส่ใจทุกรายละเอียดตั้งแต่การเลือกผ้าจนถึงการส่งมอบ"
                : "A full-service sportswear manufacturer specializing in high-quality garments — attentive to every detail from fabric to delivery."}
            </p>
            <ul className="feat">
              <li>{th ? "ผ่านมาตรฐานการผลิตเพื่อการส่งออก" : "Certified for export-grade manufacturing"}</li>
              <li>{th ? "ทีมออกแบบ & พัฒนาแบบเฉพาะแบรนด์" : "In-house design & brand development"}</li>
              <li>{th ? "ควบคุมคุณภาพทุกขั้นตอน (QC)" : "Full quality control at every step"}</li>
            </ul>
            <div className="stats">
              <div className="stat"><b>15+</b><span>{th ? "ปีประสบการณ์" : "Years"}</span></div>
              <div className="stat"><b>20+</b><span>{th ? "ประเทศส่งออก" : "Countries"}</span></div>
              <div className="stat"><b>50K+</b><span>{th ? "ตัว/เดือน" : "Units/mo"}</span></div>
            </div>
          </div>
        </section>

        <section className="sec right" data-step="2">
          <div className="box">
            <div className="eyebrow">Capabilities</div>
            <h2>{th ? "บริการรับผลิต OEM / ODM" : "OEM / ODM Manufacturing"}</h2>
            <p>
              {th
                ? "รับผลิตเสื้อผ้ากีฬาทุกประเภทตามแบบของคุณ ด้วยเทคนิคหลากหลายและกำลังผลิตรองรับออเดอร์ใหญ่"
                : "Every type of sportswear to your spec, with versatile techniques and the capacity for large orders."}
            </p>
            <ul className="feat">
              <li>{th ? "เสื้อฟุตบอล • ชุดวิ่ง • เสื้อกล้าม • ชุดทีม" : "Football • Running • Tank tops • Team kits"}</li>
              <li>{th ? "Sublimation • สกรีน • ปัก • DTF" : "Sublimation • Screen • Embroidery • DTF"}</li>
              <li>{th ? "รับออกแบบฟรีพร้อมทำตัวอย่าง" : "Free design service with samples"}</li>
              <li>{th ? "MOQ ยืดหยุ่น รองรับแบรนด์เล็ก-ใหญ่" : "Flexible MOQ for any brand size"}</li>
            </ul>
          </div>
        </section>

        <section className="sec" data-step="3">
          <div className="box">
            <div className="eyebrow">Portfolio</div>
            <h2>{th ? "ผลงานที่ภาคภูมิใจ" : "Work We're Proud Of"}</h2>
            <p>
              {th
                ? "เราผลิตให้แบรนด์กีฬา ทีม สโมสร และร้านค้าทั้งในและต่างประเทศ"
                : "We manufacture for sports brands, teams, clubs and retailers worldwide."}
            </p>
            <div className="works">
              {[
                { img: "/portfolio/ex_01.png", t: "ωμον · YUTA", s: th ? "เสื้อกลับด้าน · คาโม่ส้ม" : "Reversible bib · orange camo" },
                { img: "/portfolio/ex_02.png", t: "ωμον · YUTA", s: th ? "เสื้อกลับด้าน · คาโม่ฟ้า" : "Reversible bib · blue camo" },
                { img: "/portfolio/ex_03.png", t: "SEIJO High School", s: th ? "เสื้อวิ่ง (ซิงเกล็ต)" : "Running singlet" },
                { img: "/portfolio/ex_04.png", t: "MEIWA FC · ZEN", s: th ? "เสื้อกลับด้าน · ฟุตบอล" : "Reversible bib · football" },
              ].map((w, i) => (
                <figure className="workcard" key={i}>
                  <img src={w.img} alt={w.t} loading="lazy" />
                  <figcaption><b>{w.t}</b><span>{w.s}</span></figcaption>
                </figure>
              ))}
            </div>
            <a className="btn ghost" href="#contact">{th ? "ขอดูผลงานเพิ่มเติม" : "Request more samples"}</a>
          </div>
        </section>

        <section className="sec right" data-step="4">
          <div className="box">
            <div className="eyebrow">Process</div>
            <h2>{th ? "ขั้นตอนการสั่งผลิต" : "How Ordering Works"}</h2>
            <div className="steps">
              {(
                [
                  [th ? "ส่งแบบ & ปรึกษา" : "Brief & Consult", th ? "ส่งดีไซน์หรือไอเดีย รับคำปรึกษาและใบเสนอราคา" : "Send your idea, get advice and a quote"],
                  [th ? "ทำตัวอย่าง" : "Sampling", th ? "ผลิต Sample ให้ตรวจก่อนผลิตจริง" : "A sample for approval before production"],
                  [th ? "ผลิตจริง" : "Production", th ? "เข้าสายการผลิตพร้อม QC ทุกขั้นตอน" : "Into the line with QC at every stage"],
                  [th ? "จัดส่ง" : "Delivery", th ? "แพ็คและจัดส่งทั้งในและต่างประเทศ" : "Packed and shipped, locally or worldwide"],
                ] as [string, string][]
              ).map(([title, sub], i) => (
                <div className="step" key={i}>
                  <div className="n">{String(i + 1).padStart(2, "0")}</div>
                  <div className="t">
                    {title}
                    <small>{sub}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec center" data-step="5">
          <div className="box" style={{ maxWidth: 760 }}>
            <div className="eyebrow">Our Team</div>
            <h2>{th ? "ทีมงานของเรา" : "Meet Our Team"}</h2>
            <p style={{ maxWidth: 520, margin: "0 auto 6px" }}>
              {th
                ? "ทีมมืออาชีพที่อยู่เบื้องหลังทุกออเดอร์ — ตั้งแต่ออกแบบ ควบคุมการผลิต จนถึงดูแลลูกค้า"
                : "The professionals behind every order — from design and production control to client care."}
            </p>
            <div className="team">
              {team.map((m, i) => (
                <div className="tmember" key={i}>
                  <div className="tavatar">{m.icon}</div>
                  <div className="tn">{m.name}</div>
                  <div className="tr">{m.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec center" id="contact" data-step="6">
          <div className="box">
            <div className="eyebrow">Get In Touch</div>
            <h2>{th ? "พร้อมเริ่มออเดอร์ของคุณ" : "Ready to Start Your Order"}</h2>
            <p>
              {th
                ? "ติดต่อทีมงานเพื่อขอใบเสนอราคา หรือเริ่มออกแบบเสื้อของคุณได้เลย"
                : "Reach out for a quote, or start designing your own kit right away."}
            </p>
            <div className="cinfo" style={{ maxWidth: 420, margin: "14px auto 18px" }}>
              <div>📧 techkairos241@gmail.com</div>
              <div>💬 LINE: @axiomsiam</div>
              <div>📞 0XX-XXX-XXXX</div>
            </div>
            <div className="btnrow" style={{ justifyContent: "center" }}>
              <Link className="btn solid" href={designHref}>🎨 {th ? "ออกแบบเสื้อเอง" : "Design Your Own"}</Link>
              <a className="btn ghost" href="mailto:techkairos241@gmail.com">{th ? "ส่งอีเมล" : "Email Us"}</a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="fgrid">
          <div className="fbrand" style={{ maxWidth: 280 }}>
            <img src={logoFull} alt="Axiom Siam Co.,Ltd." style={{ height: 66, width: "auto", display: "block", marginBottom: 4 }} />
            <p style={{ marginTop: 10 }}>
              {th
                ? "โรงงานผลิตเสื้อผ้ากีฬาครบวงจร รับผลิต OEM/ODM คุณภาพส่งออก"
                : "Full-service sportswear manufacturer. Export-quality OEM/ODM production."}
            </p>
          </div>
          <div>
            <h4>{th ? "เมนู" : "Menu"}</h4>
            <a href="#contact">{th ? "เกี่ยวกับเรา" : "About"}</a>
            <Link href={designHref}>{th ? "ออกแบบเสื้อ" : "Design"}</Link>
            <a href="#contact">{th ? "ติดต่อ" : "Contact"}</a>
          </div>
          <div>
            <h4>{th ? "ติดต่อ" : "Contact"}</h4>
            <a href="mailto:techkairos241@gmail.com">techkairos241@gmail.com</a>
            <p>LINE: @axiomsiam</p>
            <p>0XX-XXX-XXXX</p>
          </div>
        </div>
        <div className="copyr">© 2026 Axiom Siam Co.,Ltd. · All rights reserved.</div>
      </footer>
    </div>
  );
}
