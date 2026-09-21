"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Hero } from "@/components/Hero";
import { Pipeline } from "@/components/Pipeline";
import { CountUp, Marquee, Reveal, SplitReveal, useScrollRefresh } from "@/components/Motion";
import { EMPTY_STATS, getStats, listProfiles, type Profile, type Stats } from "@/lib/oracle";
import { CONTRACT_ADDRESS, HAS_CONTRACT, NETWORK_KEY } from "@/lib/chain";

/* --------------------------------------------------------------- N°001 */

const GATSBY_POINTS = [
  { where: "p. 205", detail: "“sick in tired” — corrected in later printings", weight: 10 },
  { where: "p. 119", detail: "“jay Gatsby” set with a lowercase j", weight: 9 },
  { where: "Jacket, rear", detail: "lowercase “jay” — often hand-corrected in ink", weight: 10 },
  { where: "p. 165", detail: "“chatter” for “echolalia”", weight: 7 },
];

function Problem() {
  return (
    <section className="section">
      <div className="shell">
        <div className="marker">
          <span className="hud">N°001 / The problem</span>
          <span className="marker-line" />
          <span className="hud">≈300 people</span>
        </div>

        <div
          style={{
            display: "grid",
            gap: "clamp(28px, 4vw, 72px)",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
            alignItems: "start",
          }}
        >
          <div>
            <h2 className="display d-l" style={{ marginBottom: 26 }}>
              <SplitReveal text="The knowledge lives in about three hundred heads." />
            </h2>
            <Reveal delay={0.1}>
              <p className="lede" style={{ marginBottom: 20 }}>
                Telling a true first printing from a later one is not intuition.
                It is a checklist: a handful of concrete, photographable details
                that the publisher changed between impressions.
              </p>
              <p className="lede" style={{ marginBottom: 20 }}>
                The trouble is where that checklist lives — in out-of-print
                bibliographies, in auction catalogues, in forum threads, and in
                the memory of a small number of specialists who are not getting
                any younger. Meanwhile the seller on a marketplace does not know
                what they have, and the buyer does not know what they are buying.
              </p>
              <p className="lede">
                And the single most profitable fraud in the trade is quiet: a
                later dust jacket placed on an early book. The jacket carries
                most of the value, and almost nobody checks them separately.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.15} className="panel ticks panel-pad">
            <div className="spread" style={{ marginBottom: 20 }}>
              <span className="hud">Worked example</span>
              <span className="hud">Scribner&rsquo;s, 1925</span>
            </div>
            <div className="display d-m" style={{ marginBottom: 4 }}>
              The Great Gatsby
            </div>
            <div className="hud" style={{ marginBottom: 22 }}>
              F. Scott Fitzgerald · first printing points
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Where</th>
                  <th>First-printing state</th>
                  <th style={{ width: 58, textAlign: "right" }}>Wt</th>
                </tr>
              </thead>
              <tbody>
                {GATSBY_POINTS.map((point) => (
                  <tr key={point.where}>
                    <td className="mono" style={{ color: "var(--paper)", whiteSpace: "nowrap" }}>
                      {point.where}
                    </td>
                    <td>{point.detail}</td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        color: point.weight >= 9 ? "var(--vermilion)" : "var(--grey-dim)",
                      }}
                    >
                      {point.weight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="hint" style={{ marginTop: 18 }}>
              Weight 9 and above is decisive: a single contradiction settles the
              question against the copy.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- N°003 */

function Ledger() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [nextStats, nextProfiles] = await Promise.all([getStats(), listProfiles(0, 6)]);
      if (!alive) return;
      setStats(nextStats);
      setProfiles(nextProfiles);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useScrollRefresh(profiles.length);

  const cells = [
    { label: "Editions profiled", value: stats.profiles },
    { label: "Certificates issued", value: stats.certificates },
    { label: "Passed screening", value: stats.verified },
    { label: "Failed or flagged", value: stats.rejected },
  ];

  return (
    <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div className="marker">
          <span className="hud">N°003 / The ledger</span>
          <span className="marker-line" />
          <span className="hud">Live · {NETWORK_KEY}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 45%), 1fr))",
            gap: 1,
            background: "var(--line)",
            border: "1px solid var(--line)",
            marginBottom: 32,
          }}
        >
          {cells.map((cell) => (
            <div key={cell.label} style={{ background: "var(--ink)", padding: "26px 22px" }}>
              <div
                className="display chrome"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", marginBottom: 8 }}
              >
                {loaded ? <CountUp value={cell.value} pad={2} /> : "··"}
              </div>
              <div className="hud">{cell.label}</div>
            </div>
          ))}
        </div>

        {profiles.length > 0 ? (
          <>
            <div className="spread" style={{ marginBottom: 18 }}>
              <span className="hud-b">Recently profiled editions</span>
              <Link href="/registry" className="hud link-u">
                Open registry ↗
              </Link>
            </div>
            <div className="cols">
              {profiles.map((profile, index) => (
                <Reveal key={profile.id} delay={index * 0.05}>
                  <Link
                    href={`/registry?profile=${profile.id}`}
                    className="panel panel-pad"
                    style={{ display: "block", height: "100%" }}
                  >
                    <div className="spread" style={{ marginBottom: 14 }}>
                      <span className="hud">{profile.id}</span>
                      <span className="hud">
                        {profile.points?.length ?? 0} point{(profile.points?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="display d-m" style={{ fontStretch: "105%", marginBottom: 6 }}>
                      {profile.title}
                    </div>
                    <div className="hud">
                      {profile.author} · {profile.publisher} · {profile.year}
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </>
        ) : (
          <div className="panel panel-pad">
            <p className="lede" style={{ fontSize: 15 }}>
              {!HAS_CONTRACT
                ? "No contract address is configured. Deploy the contract and set NEXT_PUBLIC_CONTRACT_ADDRESS."
                : loaded
                  ? "No editions profiled yet. The registry starts empty — the first profile you create is the first one anyone can verify against."
                  : "Reading the registry…"}
            </p>
            {HAS_CONTRACT ? (
              <p className="hud break" style={{ marginTop: 14 }}>
                Contract {CONTRACT_ADDRESS}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- N°004 */

const LIMITS = [
  {
    head: "It does not detect a good forgery",
    body: "Paper stock, ink ageing, binding structure, thread count — none of that survives a photograph. A determined forger with the right stock will pass this and fail a bibliographer holding the book.",
  },
  {
    head: "It is a screening layer",
    body: "Its job is to settle the obvious 90% in minutes and hand the specialist only the cases that are genuinely hard. That is where the time and the money actually go.",
  },
  {
    head: "The profile can be wrong",
    body: "A point extracted from a reference can be mistaken. That is what challenges are for: a corrected point corrects every certificate scored against it from then on.",
  },
];

function Limits() {
  return (
    <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="shell">
        <div className="marker">
          <span className="hud">N°004 / What this is not</span>
          <span className="marker-line" />
        </div>
        <h2 className="display d-l" style={{ marginBottom: 40, maxWidth: "18ch" }}>
          <SplitReveal text="An instrument, not an appraisal." />
        </h2>
        <div className="cols">
          {LIMITS.map((limit, index) => (
            <Reveal key={limit.head} delay={index * 0.07} className="panel panel-pad">
              <div className="display d-m" style={{ fontStretch: "105%", marginBottom: 12 }}>
                {limit.head}
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.62, color: "var(--grey)" }}>
                {limit.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CTA */

function Outro() {
  return (
    <section style={{ borderTop: "1px solid var(--line)", paddingBlock: "clamp(60px, 10vh, 120px)" }}>
      <Marquee speed={44} reverse>
        <Link href="/verify" className="display d-xl chrome" style={{ display: "block" }}>
          Verify a copy ·
        </Link>
      </Marquee>
      <div className="shell" style={{ marginTop: 44 }}>
        <div className="spread">
          <p className="lede" style={{ fontSize: 15, maxWidth: "48ch" }}>
            Pick an edition from the registry, point the contract at photographs
            of your copy, and watch it work through the checklist one point at a
            time.
          </p>
          <div className="row">
            <Link href="/verify" className="btn btn-accent">
              Start a verification
            </Link>
            <Link href="/registry" className="btn">
              Browse certificates
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Problem />
      <Pipeline />
      <Ledger />
      <Limits />
      <Outro />
    </>
  );
}
