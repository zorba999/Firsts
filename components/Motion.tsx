"use client";

/**
 * Motion primitives.
 *
 * One GSAP registration point, one Lenis instance driven by the GSAP ticker so
 * scroll-linked animation and smooth scrolling never fight over rAF, and a
 * small set of reveal components used everywhere else.
 *
 * Everything degrades: with `prefers-reduced-motion`, smooth scroll is skipped
 * and reveals resolve to their final state immediately.
 */

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/** Register ScrollTrigger exactly once. Not a hook — safe to call anywhere. */
function ensureGsap() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return gsap;
}

export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Stop every tween while the tab is in the background. The marquees and the
 * hero disc loop forever by design; keeping them running behind another tab is
 * a battery cost with nobody watching.
 */
export function useIdleWhenHidden() {
  useEffect(() => {
    const g = ensureGsap();
    const onVisibility = () => {
      if (document.hidden) g.globalTimeline.pause();
      else g.globalTimeline.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}

/* ------------------------------------------------------------ smooth scroll */

export function SmoothScroll({ children }: { children: ReactNode }) {
  useIdleWhenHidden();

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let cancelled = false;

    import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      const gsapInstance = ensureGsap();
      const instance = new Lenis({ duration: 1.05, smoothWheel: true });
      lenis = instance as unknown as typeof lenis;

      instance.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => instance.raf(time * 1000);
      gsapInstance.ticker.add(tick);
      gsapInstance.ticker.lagSmoothing(0);

      (instance as unknown as { __tick?: (t: number) => void }).__tick = tick;
    });

    return () => {
      cancelled = true;
      if (lenis) {
        const tick = (lenis as unknown as { __tick?: (t: number) => void }).__tick;
        if (tick) gsap.ticker.remove(tick);
        lenis.destroy();
      }
    };
  }, []);

  return <>{children}</>;
}

/* ------------------------------------------------------------------ reveals */

type RevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "li" | "article" | "header" | "footer";
};

/** Fade + rise once, when the element scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  style,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const g = ensureGsap();
    if (prefersReducedMotion()) {
      g.set(node, { opacity: 1, y: 0 });
      return;
    }
    const ctx = g.context(() => {
      g.fromTo(
        node,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          delay,
          ease: "power3.out",
          scrollTrigger: { trigger: node, start: "top 88%", once: true },
        },
      );
    }, node);
    return () => ctx.revert();
  }, [delay, y]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{ opacity: 0, ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * Split a headline into words, each in its own overflow-hidden line box, and
 * rise them in sequence. Words rather than characters: characters shred long
 * headlines on narrow screens and cost a node each.
 */
export function SplitReveal({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.045,
  trigger = true,
}: {
  text: string;
  className?: string;
  /**
   * Applied to the span that holds the glyphs. A gradient fill belongs here,
   * never on an ancestor: `background-clip: text` does not survive the
   * `overflow: hidden` wrapper each word needs in order to be masked.
   */
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  trigger?: boolean;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const g = ensureGsap();
    const words = node.querySelectorAll<HTMLElement>("[data-word] > span");
    if (prefersReducedMotion()) {
      g.set(words, { yPercent: 0, opacity: 1 });
      return;
    }
    const ctx = g.context(() => {
      g.fromTo(
        words,
        { yPercent: 112, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.05,
          delay,
          stagger,
          ease: "power4.out",
          scrollTrigger: trigger ? { trigger: node, start: "top 90%", once: true } : undefined,
        },
      );
    }, node);
    return () => ctx.revert();
  }, [text, delay, stagger, trigger, wordClassName]);

  const words = text.split(" ");

  return (
    <span ref={ref} className={className} style={{ display: "block" }}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span
            data-word
            style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top" }}
          >
            <span
              className={wordClassName}
              style={{ display: "inline-block", willChange: "transform" }}
            >
              {word}
            </span>
          </span>
          {/* A real space between wrappers, not inside them: an inline-block
              swallows its own trailing space and the line would never break. */}
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Recompute every ScrollTrigger once a page's async data has landed.
 *
 * Trigger positions are measured from document height. Chain reads resolve
 * after mount and change that height, which leaves pinned sections ending in
 * the wrong place until something else forces a refresh.
 */
export function useScrollRefresh(dep: unknown) {
  useEffect(() => {
    ensureGsap();
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    return () => window.clearTimeout(id);
  }, [dep]);
}

/* ------------------------------------------------------------------ marquee */

/** Seamless horizontal loop. Duplicated track, wrapped with modifiers. */
export function Marquee({
  children,
  speed = 42,
  reverse = false,
  className,
}: {
  children: ReactNode;
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const g = ensureGsap();
    const tracks = node.querySelectorAll<HTMLElement>(".marquee-track");
    if (!tracks.length) return;

    const ctx = g.context(() => {
      const width = tracks[0].offsetWidth;
      if (!width) return;
      g.set(tracks, { x: (i: number) => i * width });
      const tween = g.to(tracks, {
        x: reverse ? `+=${width}` : `-=${width}`,
        duration: width / speed,
        ease: "none",
        repeat: -1,
        modifiers: {
          x: (value: string) => {
            const x = parseFloat(value) % width;
            return `${reverse ? x - width : x}px`;
          },
        },
      });
      if (prefersReducedMotion()) tween.pause();
    }, node);

    return () => ctx.revert();
  }, [speed, reverse]);

  return (
    <div ref={ref} className={`marquee ${className || ""}`}>
      <div className="marquee-track">{children}</div>
      <div className="marquee-track" aria-hidden>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parallax */

/** Shift a layer against the scroll. `depth` is a fraction of viewport height. */
export function Parallax({
  children,
  depth = 0.12,
  className,
}: {
  children: ReactNode;
  depth?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    const g = ensureGsap();
    const ctx = g.context(() => {
      g.to(node, {
        yPercent: depth * 100,
        ease: "none",
        scrollTrigger: { trigger: node, start: "top bottom", end: "bottom top", scrub: true },
      });
    }, node);
    return () => ctx.revert();
  }, [depth]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- odometer */

/** Count a number up when it enters view. Used for the on-chain stat row. */
export function CountUp({
  value,
  duration = 1.5,
  pad = 0,
}: {
  value: number;
  duration?: number;
  pad?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const g = ensureGsap();
    const format = (n: number) => String(Math.round(n)).padStart(pad, "0");
    if (prefersReducedMotion()) {
      node.textContent = format(value);
      return;
    }
    const state = { n: 0 };
    const ctx = g.context(() => {
      g.to(state, {
        n: value,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          node.textContent = format(state.n);
        },
        scrollTrigger: { trigger: node, start: "top 92%", once: true },
      });
    }, node);
    return () => ctx.revert();
  }, [value, duration, pad]);

  return <span ref={ref}>{String(0).padStart(pad, "0")}</span>;
}

/* ---------------------------------------------------------------- scramble */

/** Cycle random glyphs into the final string. Used on hover for HUD labels. */
export function useScramble(text: string) {
  const ref = useRef<HTMLElement | null>(null);
  const [glyphs] = useState("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>*#");

  const run = () => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    let frame = 0;
    const total = text.length * 3;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor(frame / 3);
      node.textContent = text
        .split("")
        .map((char, index) =>
          index < settled || char === " "
            ? char
            : glyphs[Math.floor(Math.random() * glyphs.length)],
        )
        .join("");
      if (frame >= total) {
        window.clearInterval(id);
        node.textContent = text;
      }
    }, 22);
  };

  return { ref, run };
}
