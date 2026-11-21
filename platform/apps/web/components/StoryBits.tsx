"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/three-cdn";

/** splits a heading into words that rise in one after another when the panel is active; *word = accent */
export function Words({ text }: { text: string }) {
  let n = 0;
  return (
    <>
      {text.split("\n").map((line, li) => {
        const ws = line.split(" ");
        return (
          <span key={li} className="ln">
            {ws.map((w, wi) => {
              const i = n++;
              const cut = w.indexOf("*");
              const pre = cut < 0 ? w : w.slice(0, cut);
              const acc = cut < 0 ? "" : w.slice(cut + 1);
              return (
                <span key={wi}>
                  <span className="wm">
                    <span className="w" style={{ ["--d" as any]: `${i * 70}ms` }}>
                      {pre}{acc && <span className="acc">{acc}</span>}
                    </span>
                  </span>
                  {wi < ws.length - 1 ? " " : null}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

/** a ring that trails the pointer on mouse/trackpad devices; grows over links and buttons */
export function RingCursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const still = prefersReducedMotion();
    document.documentElement.classList.add("ax-cursor-on");
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      const hot = !!(e.target as Element | null)?.closest?.("a,button,[role=tab],input,select,textarea,canvas");
      ring.current?.toggleAttribute("data-hot", hot);
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      rx += (x - rx) * (still ? 1 : 0.18); ry += (y - ry) * (still ? 1 : 0.18);
      if (ring.current) ring.current.style.transform = `translate(${rx}px,${ry}px)`;
      if (dot.current) dot.current.style.transform = `translate(${x}px,${y}px)`;
    };
    const leave = () => { x = y = -100; };
    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.documentElement.classList.remove("ax-cursor-on");
    };
  }, []);
  return (
    <>
      <div ref={ring} className="ax-cursor-ring" aria-hidden="true" />
      <div ref={dot} className="ax-cursor-dot" aria-hidden="true" />
    </>
  );
}
