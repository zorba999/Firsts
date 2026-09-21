"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHead, CertificateCard, EmptyState } from "@/components/Bits";
import { Reveal } from "@/components/Motion";
import {
  listCertificates,
  listProfiles,
  type Certificate,
  type Profile,
} from "@/lib/oracle";
import { CONTRACT_ADDRESS, HAS_CONTRACT, NETWORK_KEY, shortAddress } from "@/lib/chain";

type Tab = "editions" | "certificates";

function RegistryBody() {
  const params = useSearchParams();
  const focusProfile = params.get("profile");

  const [tab, setTab] = useState<Tab>(focusProfile ? "editions" : "editions");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [nextProfiles, nextCertificates] = await Promise.all([
        listProfiles(0, 48),
        listCertificates(0, 48),
      ]);
      if (!alive) return;
      setProfiles(nextProfiles);
      setCertificates(nextCertificates);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filteredProfiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((profile) =>
      `${profile.title} ${profile.author} ${profile.publisher} ${profile.year}`
        .toLowerCase()
        .includes(needle),
    );
  }, [profiles, query]);

  const filteredCertificates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return certificates;
    return certificates.filter((certificate) =>
      `${certificate.id} ${certificate.title} ${certificate.author} ${certificate.verdict}`
        .toLowerCase()
        .includes(needle),
    );
  }, [certificates, query]);

  return (
    <div className="shell">
      <PageHead
        index="005"
        label="Registry"
        title="Everything on the record"
        lede="Editions the network has profiled, and the certificates issued against them. All of it read live from the contract."
        right={
          <span className="hud break">
            {HAS_CONTRACT ? shortAddress(CONTRACT_ADDRESS, 6) : "not deployed"} · {NETWORK_KEY}
          </span>
        }
      />

      <div className="spread" style={{ marginBottom: 26 }}>
        <div className="row" style={{ gap: 6 }}>
          <TabButton active={tab === "editions"} onClick={() => setTab("editions")}>
            Editions · {profiles.length}
          </TabButton>
          <TabButton active={tab === "certificates"} onClick={() => setTab("certificates")}>
            Certificates · {certificates.length}
          </TabButton>
        </div>
        <input
          className="field"
          style={{ maxWidth: 320 }}
          placeholder="Filter by title, author, verdict…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <EmptyState title="Reading the chain" body="Fetching profiles and certificates from the registry…" />
      ) : tab === "editions" ? (
        filteredProfiles.length ? (
          <div className="cols">
            {filteredProfiles.map((profile, index) => (
              <Reveal key={profile.id} delay={Math.min(index, 8) * 0.04}>
                <ProfileCard profile={profile} highlight={profile.id === focusProfile} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState
            title={query ? "Nothing matches" : "No editions yet"}
            body={
              query
                ? "Try a shorter query — the filter matches title, author, publisher and year."
                : "The registry starts empty. Profile an edition from the verify page and it will appear here for everyone."
            }
          />
        )
      ) : filteredCertificates.length ? (
        <div className="cols">
          {filteredCertificates.map((certificate, index) => (
            <Reveal key={certificate.id} delay={Math.min(index, 8) * 0.04}>
              <CertificateCard certificate={certificate} />
            </Reveal>
          ))}
        </div>
      ) : (
        <EmptyState
          title={query ? "Nothing matches" : "No certificates yet"}
          body={
            query
              ? "Certificates are searchable by id, title, author and verdict."
              : "Once a copy is adjudicated against a profile, its certificate lands here permanently."
          }
        />
      )}

      <div style={{ height: 90 }} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="hud-b"
      style={{
        padding: "10px 16px",
        border: "1px solid",
        borderColor: active ? "var(--line-strong)" : "transparent",
        borderRadius: 2,
        background: active ? "rgba(236,233,226,0.05)" : "transparent",
        color: active ? "var(--paper)" : "var(--grey-dim)",
      }}
    >
      {children}
    </button>
  );
}

function ProfileCard({ profile, highlight }: { profile: Profile; highlight?: boolean }) {
  const decisive = (profile.points || []).filter((point) => point.weight >= 9).length;

  return (
    <div
      className={`panel panel-pad ${highlight ? "ticks" : ""}`}
      style={{
        height: "100%",
        borderColor: highlight ? "var(--line-strong)" : undefined,
      }}
    >
      <div className="spread" style={{ marginBottom: 14 }}>
        <span className="hud">{profile.id}</span>
        <span className={`chip ${profile.confidence === "high" ? "tone-good" : profile.confidence === "medium" ? "tone-warn" : "tone-muted"}`}>
          {profile.confidence} confidence
        </span>
      </div>

      <div className="display d-m" style={{ fontStretch: "105%", marginBottom: 6 }}>
        {profile.title}
      </div>
      <div className="hud" style={{ marginBottom: 18 }}>
        {profile.author} · {profile.publisher} · {profile.year}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
        {(profile.points || []).slice(0, 4).map((point) => (
          <li key={point.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: point.weight >= 9 ? "var(--vermilion)" : "var(--grey-dim)",
                flex: "none",
                width: 20,
              }}
            >
              {String(point.weight).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--grey)" }}>
              {point.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="spread" style={{ marginTop: 20 }}>
        <span className="hud">
          {profile.points?.length ?? 0} point{(profile.points?.length ?? 0) === 1 ? "" : "s"} ·{" "}
          {decisive} decisive
        </span>
        <Link href={`/verify?profile=${profile.id}`} className="hud link-u">
          Verify against this ↗
        </Link>
      </div>
    </div>
  );
}

export default function RegistryPage() {
  return (
    <Suspense fallback={<div className="shell" style={{ paddingTop: 120 }} />}>
      <RegistryBody />
    </Suspense>
  );
}
