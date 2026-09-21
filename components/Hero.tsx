"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { Marquee, SplitReveal, prefersReducedMotion } from "./Motion";
import { CONTRACT_ADDRESS, HAS_CONTRACT, NETWORK_KEY, shortAddress } from "@/lib/chain";

/**
 * A chrome disc behind the headline. Two stacked conic gradients rotating at
 * different rates read as brushed metal catching light, for the cost of two
 * divs and one tween — far cheaper than a canvas or a video loop.
 */
function ChromeDisc() {
  const outer = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.to(outer.current, { rotate: 360, duration: 64, ease: "none", repeat: -1 });
      gsap.to(inner.current, { rotate: -360, duration: 41, ease: "none", repeat: -1 });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: "48%",
        left: "50%",
        width: "min(58vh, 60vw)",
        aspectRatio: "1",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        opacity: 0.34,
      }}
    >
      <div
        ref={outer}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "conic-gradient(from 0deg, #2a2d33, #c8ccd2, #43474e, #eef1f4, #3a3d44, #a9aeb6, #23262b, #d8dbe0, #2a2d33)",

          maskImage: "radial-gradient(circle, transparent 46%, #000 58%, #000 66%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 46%, #000 58%, #000 66%, transparent 72%)",
        }}
      />
      <div
        ref={inner}
        style={{
          position: "absolute",
          inset: "17%",
          borderRadius: "50%",
          background:
            "conic-gradient(from 140deg, #0e0f12, #8f949c, #16181c, #d2d6dc, #1b1d21, #6d727a, #0e0f12)",
          maskImage: "radial-gradient(circle, transparent 42%, #000 56%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 42%, #000 56%, transparent 78%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          boxShadow: "inset 0 0 120px rgba(0,0,0,0.9)",
        }}
      />
    </div>
  );
}

export function Hero() {
  const scrollHint = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.to(scrollHint.current, {
        y: 9,
        duration: 1.1,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <section
      style={{
        position: "relative",
        minHeight: "calc(100svh - var(--nav-h))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <ChromeDisc />

      <div className="grid-lines" aria-hidden>
        <span /><span /><span /><span /><span /><span />
      </div>

      <div className="shell" style={{ position: "relative", zIndex: 2 }}>
        <div className="spread hud" style={{ marginBottom: "clamp(28px, 6vh, 64px)" }}>
          <span>N°000 / Index</span>
          <span>
            GenLayer · {NETWORK_KEY} ·{" "}
            {HAS_CONTRACT ? shortAddress(CONTRACT_ADDRESS, 6) : "not deployed"}
          </span>
        </div>

        <h1 className="display d-xxl" style={{ marginBottom: "clamp(22px, 3.5vh, 40px)" }}>
          <SplitReveal text="The difference" wordClassName="chrome" trigger={false} delay={0.15} />
          <SplitReveal text="between $200" wordClassName="chrome" trigger={false} delay={0.28} />
          <SplitReveal text="and $40,000" wordClassName="chrome" trigger={false} delay={0.41} />
        </h1>

        <div className="hero-row">
          <p className="lede">
            …is a typo on page 205, a missing number on a copyright page, or a
            price that was clipped from a dust jacket sixty years ago.{" "}
            <strong>FIRSTS</strong> adjudicates a rare book point by point —
            every verdict independently re-derived by GenLayer validators, every
            score computed in plain arithmetic, every certificate permanent.
          </p>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Link href="/verify" className="btn btn-accent">
              Verify a copy
            </Link>
            <Link href="/registry" className="btn">
              Registry
            </Link>
          </div>
        </div>
      </div>

      <div
        className="shell"
        style={{
          position: "relative",
          zIndex: 2,
          marginTop: "clamp(40px, 8vh, 96px)",
        }}
      >
        <div ref={scrollHint} className="hud" style={{ display: "flex", gap: 10 }}>
          <span>↓</span>
          <span>Scroll</span>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          marginTop: "clamp(28px, 5vh, 56px)",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          paddingBlock: 14,
        }}
      >
        <Marquee speed={58}>
          <span
            className="display"
            style={{ fontSize: "clamp(1.6rem, 3.4vw, 3rem)", color: "var(--grey-dim)" }}
          >
            Number line · Points of issue · Dust jacket price · Colophon · State
            · Impression · Married copy · Book club edition ·
          </span>
        </Marquee>
      </div>
    </section>
  );
}
