"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TransactionStatus } from "genlayer-js/types";
import { Gauge, PointChip, VerdictChip } from "@/components/Bits";
import { Reveal } from "@/components/Motion";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_ADDRESS, NETWORK_KEY, shortAddress } from "@/lib/chain";
import {
  VERDICT_META,
  bp,
  getCertificate,
  getChallenges,
  type Certificate,
  type Challenge,
} from "@/lib/oracle";

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextCertificate, nextChallenges] = await Promise.all([
      getCertificate(id),
      getChallenges(id),
    ]);
    setCertificate(nextCertificate);
    setChallenges(nextChallenges);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="shell" style={{ paddingTop: "clamp(40px, 8vh, 90px)" }}>
        <div className="hud">Reading certificate {id}…</div>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="shell" style={{ paddingTop: "clamp(40px, 8vh, 90px)" }}>
        <div className="marker">
          <span className="hud">N°007 / Certificate</span>
          <span className="marker-line" />
        </div>
        <h1 className="display d-xl chrome" style={{ marginBottom: 20 }}>
          Not found
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          No certificate with id <span className="mono">{id}</span> exists in this registry.
        </p>
        <Link href="/registry" className="btn">
          Back to registry
        </Link>
      </div>
    );
  }

  const meta = VERDICT_META[certificate.verdict];

  return (
    <div className="shell" style={{ paddingTop: "clamp(40px, 8vh, 90px)" }}>
      <div className="marker">
        <span className="hud">N°007 / Certificate {certificate.id}</span>
        <span className="marker-line" />
        <span className="hud">{NETWORK_KEY}</span>
      </div>

      {/* ---------------------------------------------------------- header */}
      <div
        className="panel ticks"
        style={{ padding: "clamp(22px, 3vw, 40px)", marginBottom: 22 }}
      >
        <div className="spread" style={{ alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 className="display d-l chrome" style={{ marginBottom: 8 }}>
              {certificate.title}
            </h1>
            <div className="hud">
              {certificate.author} · {certificate.publisher} · {certificate.year}
            </div>
          </div>
          <VerdictChip verdict={certificate.verdict} big />
        </div>

        <p className="lede" style={{ fontSize: 15, marginBottom: 30 }}>
          {meta?.blurb}
        </p>

        <div
          style={{
            display: "grid",
            gap: "clamp(16px, 2.4vw, 34px)",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
          }}
        >
          <Gauge label="Points matched" value={certificate.score_bp} tone={meta?.tone ?? "muted"} />
          <Gauge label="Evidence coverage" value={certificate.coverage_bp} />
          <Gauge label="Book block" value={certificate.book_bp} />
          <Gauge label="Dust jacket" value={certificate.jacket_bp} tone={certificate.jacket_bp < 5000 ? "bad" : "good"} />
        </div>
      </div>

      {/* ------------------------------------------------------- the points */}
      <div className="panel panel-pad" style={{ marginBottom: 22 }}>
        <div className="spread" style={{ marginBottom: 18 }}>
          <span className="hud-b">Point-by-point adjudication</span>
          <span className="hud">
            {certificate.points.length} point{certificate.points.length === 1 ? "" : "s"} ·{" "}
            {certificate.unreadable} unreadable
          </span>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 42 }}>Wt</th>
              <th>Point</th>
              <th style={{ width: "18%" }}>Where</th>
              <th style={{ width: 130 }}>Verdict</th>
              <th style={{ width: "26%" }}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {certificate.points.map((point) => (
              <tr key={point.id}>
                <td
                  className="mono"
                  style={{ color: point.weight >= 9 ? "var(--vermilion)" : "var(--grey-dim)" }}
                >
                  {String(point.weight).padStart(2, "0")}
                </td>
                <td style={{ color: "var(--paper)" }}>{point.label}</td>
                <td className="hud" style={{ textTransform: "none" }}>
                  {point.location || "—"}
                </td>
                <td>
                  <PointChip verdict={point.verdict} />
                </td>
                <td style={{ fontSize: 12.5 }}>{point.evidence || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "grid",
          gap: 22,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
          alignItems: "start",
          marginBottom: 22,
        }}
      >
        <ChallengePanel certificate={certificate} challenges={challenges} onDone={refresh} />
        <EvidencePanel certificate={certificate} />
      </div>

      <div style={{ height: 90 }} />
    </div>
  );
}

/* ------------------------------------------------------------ challenges */

function ChallengePanel({
  certificate,
  challenges,
  onDone,
}: {
  certificate: Certificate;
  challenges: Challenge[];
  onDone: () => Promise<void>;
}) {
  const wallet = useWallet();
  const [pointId, setPointId] = useState(certificate.points[0]?.id || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = wallet.status === "connected";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = wallet.getClient();
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "challenge_point",
        args: [certificate.id, pointId, reason],
        value: 0n,
      });
      await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        interval: 4000,
        retries: 150,
      });
      setReason("");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel panel-pad stack">
      <div className="spread">
        <span className="hud-b">Challenge a point</span>
        <span className="hud">{challenges.length} filed</span>
      </div>

      <p className="hint" style={{ margin: 0 }}>
        A challenge names one specific point rather than objecting to the
        outcome. That point alone is re-adjudicated and the certificate
        rescored — and the correction stays on the record.
      </p>

      <div>
        <label className="label" htmlFor="point">Point</label>
        <select
          id="point"
          className="field"
          value={pointId}
          onChange={(event) => setPointId(event.target.value)}
        >
          {certificate.points.map((point) => (
            <option key={point.id} value={point.id} style={{ background: "#0e0e11" }}>
              {point.id} — {point.label.slice(0, 60)} [{point.verdict}]
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="reason">Why is this wrong?</label>
        <textarea
          id="reason"
          className="field"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="The number line is legible in the third photograph, bottom left."
        />
      </div>

      <button
        className="btn"
        onClick={() => void submit()}
        disabled={!connected || busy || !pointId}
      >
        {busy ? <span className="spin" /> : null}
        {busy ? "Re-adjudicating" : connected ? "File challenge" : "Connect to challenge"}
      </button>

      {error ? (
        <p className="hint break" style={{ color: "var(--vermilion)" }}>{error}</p>
      ) : null}

      {challenges.length ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div className="hud" style={{ marginBottom: 12 }}>History</div>
          <div className="stack" style={{ gap: 12 }}>
            {challenges.map((challenge, index) => (
              <Reveal key={index} delay={index * 0.05}>
                <div style={{ borderLeft: "1px solid var(--line-strong)", paddingLeft: 12 }}>
                  <div className="spread" style={{ marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 11 }}>
                      {challenge.point_id} · {challenge.verdict_before} → {challenge.verdict_after}
                    </span>
                    <span className={`chip ${challenge.upheld ? "tone-good" : "tone-muted"}`}>
                      {challenge.upheld ? "Upheld" : "Not upheld"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--grey)" }}>
                    {challenge.reason || "No reason given."}
                  </p>
                  <div className="hud" style={{ marginTop: 5 }}>
                    by {shortAddress(challenge.by)} · certificate{" "}
                    {challenge.certificate_before} → {challenge.certificate_after}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- evidence */

function EvidencePanel({ certificate }: { certificate: Certificate }) {
  return (
    <div className="panel panel-pad stack">
      <span className="hud-b">Record</span>

      <dl style={{ margin: 0, display: "grid", gap: 14 }}>
        <Row label="Certificate">{certificate.id}</Row>
        <Row label="Profile">
          <Link href={`/registry?profile=${certificate.profile_id}`} className="link-u">
            {certificate.profile_id}
          </Link>
        </Row>
        <Row label="Holder">{shortAddress(certificate.holder, 6)}</Row>
        <Row label="Photographs">{certificate.images_used} used</Row>
        <Row label="Weighted score">{bp(certificate.score_bp)}</Row>
      </dl>

      {certificate.note ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div className="hud" style={{ marginBottom: 7 }}>Holder&rsquo;s note</div>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--grey)" }}>{certificate.note}</p>
        </div>
      ) : null}

      {certificate.images?.length ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div className="hud" style={{ marginBottom: 10 }}>Submitted photographs</div>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            }}
          >
            {certificate.images.map((url, index) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="panel"
                style={{ aspectRatio: "3/4", overflow: "hidden", position: "relative" }}
                title={url}
              >
                {/* Remote, arbitrary hosts: a plain img keeps the optimizer out
                    of it and a broken link degrades to the index label. */}
                <img
                  src={url}
                  alt={`Submitted photograph ${index + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                />
                <span
                  className="hud"
                  style={{ position: "absolute", left: 5, bottom: 4, color: "var(--paper)" }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="spread" style={{ gap: 12 }}>
      <dt className="hud" style={{ margin: 0 }}>{label}</dt>
      <dd className="mono" style={{ margin: 0, fontSize: 12.5, color: "var(--paper)" }}>
        {children}
      </dd>
    </div>
  );
}
