"use client";

import Link from "next/link";
import {
  POINT_VERDICT_META,
  VERDICT_META,
  bp,
  type Certificate,
  type PointVerdict,
  type Verdict,
} from "@/lib/oracle";
import { shortAddress } from "@/lib/chain";

/** The N°00x / LABEL header used at the top of every inner page. */
export function PageHead({
  index,
  label,
  title,
  lede,
  right,
}: {
  index: string;
  label: string;
  title: string;
  lede?: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ paddingTop: "clamp(40px, 8vh, 90px)", paddingBottom: "clamp(24px, 4vh, 44px)" }}>
      <div className="marker">
        <span className="hud">
          N°{index} / {label}
        </span>
        <span className="marker-line" />
        {right}
      </div>
      <h1 className="display d-xl chrome" style={{ marginBottom: lede ? 20 : 0 }}>
        {title}
      </h1>
      {lede ? <p className="lede">{lede}</p> : null}
    </div>
  );
}

export function VerdictChip({ verdict, big }: { verdict: Verdict; big?: boolean }) {
  const meta = VERDICT_META[verdict] ?? {
    label: verdict,
    tone: "muted" as const,
    blurb: "",
  };
  return (
    <span
      className={`chip tone-${meta.tone}`}
      style={big ? { fontSize: 12, padding: "8px 14px", letterSpacing: "0.16em" } : undefined}
    >
      {meta.label}
    </span>
  );
}

export function PointChip({ verdict }: { verdict: PointVerdict }) {
  const meta = POINT_VERDICT_META[verdict] ?? POINT_VERDICT_META.UNREADABLE;
  return <span className={`chip tone-${meta.tone}`}>{meta.label}</span>;
}

/** A labelled percentage bar. Colour comes from the enclosing tone class. */
export function Gauge({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "warn" | "muted";
}) {
  return (
    <div className={`tone-${tone}`}>
      <div className="spread" style={{ marginBottom: 7 }}>
        <span className="hud" style={{ color: "var(--grey-dim)" }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 12 }}>
          {bp(value)}
        </span>
      </div>
      <div className="meter">
        <i style={{ transform: `scaleX(${Math.min(1, Math.max(0, (value ?? 0) / 10000))})` }} />
      </div>
    </div>
  );
}

export function CertificateCard({ certificate }: { certificate: Certificate }) {
  const meta = VERDICT_META[certificate.verdict];
  return (
    <Link
      href={`/certificate/${certificate.id}`}
      className="panel panel-pad"
      style={{ display: "block", height: "100%" }}
    >
      <div className="spread" style={{ marginBottom: 16 }}>
        <span className="hud">{certificate.id}</span>
        <VerdictChip verdict={certificate.verdict} />
      </div>

      <div className="display d-m" style={{ fontStretch: "105%", marginBottom: 6 }}>
        {certificate.title}
      </div>
      <div className="hud" style={{ marginBottom: 20 }}>
        {certificate.author} · {certificate.year}
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <Gauge label="Points matched" value={certificate.score_bp} tone={meta?.tone ?? "muted"} />
        <Gauge label="Coverage" value={certificate.coverage_bp} />
      </div>

      <div className="spread hud" style={{ marginTop: 18 }}>
        <span>Holder {shortAddress(certificate.holder)}</span>
        <span>
          {certificate.challenge_count > 0
            ? `${certificate.challenge_count} challenge${certificate.challenge_count > 1 ? "s" : ""}`
            : "Unchallenged"}
        </span>
      </div>
    </Link>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel ticks panel-pad" style={{ textAlign: "center", paddingBlock: 60 }}>
      <div className="display d-m" style={{ marginBottom: 10 }}>
        {title}
      </div>
      <p className="lede" style={{ fontSize: 14.5, margin: "0 auto" }}>
        {body}
      </p>
    </div>
  );
}
