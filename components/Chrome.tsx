"use client";

/**
 * Persistent chrome: texture overlays, custom cursor, preloader, nav.
 * These wrap every page and never unmount on navigation.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { prefersReducedMotion, useScramble } from "./Motion";
import { WalletButton } from "./WalletButton";
import { NETWORK_KEY } from "@/lib/chain";

/* --------------------------------------------------------------- textures */

/**
 * Film grain, generated once into a data URL rather than shipped as an asset.
 * A 96×96 tile of alpha noise is imperceptibly repetitive under the animation
 * and costs nothing to download.
 */
function useGrainUrl() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.random() * 255;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 26;
    }
    ctx.putImageData(image, 0, 0);
    setUrl(canvas.toDataURL("image/png"));
  }, []);

  return url;
}

export function Textures() {
  const grain = useGrainUrl();
  return (
    <>
      <div className="tex-vignette" aria-hidden />
      <div className="tex-scan" aria-hidden />
      {grain ? (
        <div
          className="tex-grain"
          aria-hidden
          style={{ ["--grain-url" as string]: `url(${grain})` }}
        />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- cursor */

export function Cursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    // quickTo keeps the ring lagging behind the pointer without a rAF loop of
    // our own — GSAP already owns the ticker.
    const dotX = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power3" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power3" });
    const ringX = gsap.quickTo(ring, "x", { duration: 0.5, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.5, ease: "power3" });

    const onMove = (event: PointerEvent) => {
      dotX(event.clientX);
      dotY(event.clientY);
      ringX(event.clientX);
      ringY(event.clientY);
    };

    const interactive = "a, button, input, textarea, select, [data-cursor]";
    const onOver = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const hit = target?.closest?.(interactive);
      gsap.to(ring, {
        scale: hit ? 1.75 : 1,
        opacity: hit ? 0.85 : 1,
        duration: 0.35,
        ease: "power3.out",
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden />
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}

/* -------------------------------------------------------------- preloader */

/**
 * Runs once per browser session. A preloader on every navigation is a tax on
 * the person using the site, so a sessionStorage flag retires it after the
 * first visit.
 */
export function Preloader() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const [done, setDone] = useState(true);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.sessionStorage.getItem("firsts.preloaded") === "1";
    } catch {
      seen = false;
    }
    if (seen || prefersReducedMotion()) {
      setDone(true);
      document.documentElement.dataset.ready = "1";
      return;
    }

    setDone(false);
    document.body.style.overflow = "hidden";

    const state = { n: 0 };
    const timeline = gsap.timeline({
      onComplete: () => {
        try {
          window.sessionStorage.setItem("firsts.preloaded", "1");
        } catch {
          /* ignore */
        }
        document.body.style.overflow = "";
        document.documentElement.dataset.ready = "1";
        setDone(true);
      },
    });

    timeline
      .to(state, {
        n: 100,
        duration: 1.85,
        ease: "power2.inOut",
        onUpdate: () => {
          if (countRef.current) {
            countRef.current.textContent = String(Math.round(state.n)).padStart(3, "0");
          }
        },
      })
      .fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 1.85, ease: "power2.inOut" }, 0)
      .to(rootRef.current, { yPercent: -100, duration: 0.95, ease: "expo.inOut" }, "+=0.15");

    return () => {
      timeline.kill();
      document.body.style.overflow = "";
    };
  }, []);

  if (done) return null;

  return (
    <div ref={rootRef} className="preloader">
      <div className="preloader-inner">
        <div className="spread" style={{ marginBottom: 10 }}>
          <span className="hud">FIRSTS / points-of-issue oracle</span>
          <span className="hud">GenLayer · {NETWORK_KEY}</span>
        </div>
        <div className="preloader-count chrome">
          <span ref={countRef}>000</span>
        </div>
        <div className="preloader-bar">
          <i ref={barRef as never} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- nav */

const LINKS = [
  { href: "/", label: "Index" },
  { href: "/registry", label: "Registry" },
  { href: "/verify", label: "Verify" },
];

function Wordmark() {
  const { ref, run } = useScramble("FIRSTS");
  return (
    <Link href="/" onPointerEnter={run} aria-label="FIRSTS — home">
      <span
        ref={ref as never}
        className="mono"
        style={{
          fontSize: 14,
          letterSpacing: "0.38em",
          fontWeight: 700,
          color: "var(--paper)",
        }}
      >
        FIRSTS
      </span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="nav" data-stuck={stuck}>
      <Wordmark />
      <nav className="nav-links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            data-active={pathname === link.href}
          >
            {link.label}
          </Link>
        ))}
        <WalletButton />
      </nav>
    </header>
  );
}

/* ----------------------------------------------------------------- footer */

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", paddingBlock: "42px 56px" }}>
      <div className="shell">
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="display d-m chrome" style={{ marginBottom: 12 }}>
              FIRSTS
            </div>
            <p className="hud" style={{ maxWidth: 360, letterSpacing: "0.1em", lineHeight: 1.8 }}>
              A points-of-issue oracle for rare books. Adjudicated by GenLayer
              validators, scored deterministically, recorded on-chain.
            </p>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="hud">Network · {NETWORK_KEY}</span>
            <a
              className="hud link-u"
              href="https://docs.genlayer.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              GenLayer docs ↗
            </a>
            <a
              className="hud link-u"
              href="https://studio.genlayer.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              GenLayer Studio ↗
            </a>
          </div>
        </div>
        <div className="hud" style={{ marginTop: 46, opacity: 0.55 }}>
          Screening instrument, not an appraisal. Physical authentication of a
          valuable copy remains a job for a human bibliographer.
        </div>
      </div>
    </footer>
  );
}
