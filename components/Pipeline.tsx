"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion, useIsomorphicLayoutEffect } from "./Motion";

const STEPS = [
  {
    n: "01",
    title: "Profile the edition",
    body: "The contract renders a whitelisted bibliographic reference in a browser, then extracts the points of issue as structured data — kind, location, first state, later state, weight. Reference text is fenced and demoted to data, so a page that tells the model what to do gets ignored.",
    tag: "gl.nondet.web.render → exec_prompt",
    note: "Validators re-read the same references and build their own point list. Agreement is measured on what survives rewording — the decisive structure, the families of mark, and the page numbers and years cited — because validators run different models and no two describe a typo the same way.",
  },
  {
    n: "02",
    title: "Adjudicate one point at a time",
    body: "Photographs of the copy are fetched and passed to a vision model once per point, with an answer space of exactly three values: MATCH, NO_MATCH, UNREADABLE. Narrow questions are the whole trick — a single prompt asking “is this a first edition?” produces prose no two validators phrase alike.",
    tag: "exec_prompt(images=[…])",
    note: "UNREADABLE is a first-class answer. Guessing on a blurred photograph is worse than admitting the photograph does not show it.",
  },
  {
    n: "03",
    title: "Score deterministically",
    body: "Weighted matches, coverage, and separate book and jacket subtotals — all integer arithmetic in plain Python, no model involved. A verdict a buyer relies on has to be recomputable by anyone holding the same per-point answers.",
    tag: "pure python · basis points",
    note: "This is where MARRIED_COPY_SUSPECTED falls out: the book scores as a first printing while the jacket does not.",
  },
  {
    n: "04",
    title: "Record, then stay challengeable",
    body: "The certificate is written on-chain with every point, every verdict and the evidence sentence behind it. Anyone can challenge a specific point; that point alone is re-adjudicated and the certificate rescored, with the correction kept in the record.",
    tag: "challenge_point()",
    note: "A certificate that had to be corrected cannot hide that it was.",
  },
];

/**
 * Horizontally pinned walkthrough. The section pins and the track translates
 * with scroll, so the four steps read as one continuous move.
 *
 * Below 900px the pin is dropped entirely and the steps stack — a horizontal
 * scrub on a phone fights the user's own gesture.
 */
export function Pipeline() {
  const root = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const rootNode = root.current;
    const trackNode = track.current;
    if (!rootNode || !trackNode) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      ScrollTrigger.matchMedia({
        "(min-width: 900px)": () => {
          if (prefersReducedMotion()) return;
          const distance = () => trackNode.scrollWidth - window.innerWidth + 120;

          const tween = gsap.to(trackNode, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: rootNode,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 0.8,
              invalidateOnRefresh: true,
              anticipatePin: 1,
            },
          });

          gsap.utils.toArray<HTMLElement>("[data-step]").forEach((step) => {
            gsap.fromTo(
              step.querySelector("[data-step-body]"),
              { opacity: 0.25 },
              {
                opacity: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: step,
                  containerAnimation: tween,
                  start: "left 82%",
                  end: "left 46%",
                  scrub: true,
                },
              },
            );
          });
        },
      });
    }, rootNode);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} data-pipeline style={{ position: "relative", overflow: "hidden" }}>
      <div
        className="shell"
        style={{ paddingTop: "clamp(60px, 9vh, 110px)", paddingBottom: 30 }}
      >
        <div className="marker">
          <span className="hud">N°002 / Mechanism</span>
          <span className="marker-line" />
          <span className="hud">Four moves</span>
        </div>
        <h2 className="display d-l" style={{ maxWidth: "16ch" }}>
          Judgment where it is needed. Arithmetic everywhere else.
        </h2>
      </div>

      <div
        ref={track}
        className="pipeline-track"
        style={{
          display: "flex",
          gap: "clamp(16px, 2vw, 28px)",
          paddingInline: "var(--gutter)",
          paddingBottom: "clamp(60px, 9vh, 110px)",
          willChange: "transform",
        }}
      >
        {STEPS.map((step) => (
          <article
            key={step.n}
            data-step
            className="panel ticks panel-pad"
            style={{
              flex: "none",
              width: "min(440px, 84vw)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div className="spread">
              <span
                className="display"
                style={{ fontSize: "2.6rem", color: "var(--vermilion)", lineHeight: 1 }}
              >
                {step.n}
              </span>
              <span className="hud">{step.tag}</span>
            </div>

            <h3 className="display d-m" style={{ fontStretch: "110%" }}>
              {step.title}
            </h3>

            <div data-step-body style={{ display: "grid", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: "var(--grey)" }}>
                {step.body}
              </p>
              <p
                className="hud"
                style={{
                  margin: 0,
                  lineHeight: 1.75,
                  letterSpacing: "0.09em",
                  borderLeft: "1px solid var(--line-strong)",
                  paddingLeft: 12,
                  color: "var(--grey-dim)",
                  textTransform: "none",
                }}
              >
                {step.note}
              </p>
            </div>
          </article>
        ))}
      </div>

      <style>{`
        @media (max-width: 899px) {
          .pipeline-track {
            flex-direction: column;
            transform: none !important;
          }
          .pipeline-track > article { width: 100%; }
        }
      `}</style>
    </section>
  );
}
