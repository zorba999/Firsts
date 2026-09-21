"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TransactionStatus } from "genlayer-js/types";
import { PageHead } from "@/components/Bits";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_ADDRESS, HAS_CONTRACT, IS_GASLESS, NETWORK_KEY } from "@/lib/chain";
import { listProfiles, type Profile } from "@/lib/oracle";

type Phase = "idle" | "submitting" | "pending" | "done" | "failed";

/** The stages a write moves through, shown as a live console while it runs. */
const STAGES = [
  "Transaction submitted",
  "Leader fetching evidence",
  "Adjudicating points",
  "Validators re-deriving",
  "Consensus reached",
];

const TRUSTED_HOSTS = [
  "en.wikipedia.org",
  "openlibrary.org",
  "archive.org",
  "catalog.hathitrust.org",
  "abebooks.com",
  "biblio.com",
  "gutenberg.org",
];

function VerifyBody() {
  const wallet = useWallet();
  const params = useSearchParams();
  const router = useRouter();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mode, setMode] = useState<"verify" | "profile">("verify");

  useEffect(() => {
    void listProfiles(0, 48).then(setProfiles);
  }, []);

  useEffect(() => {
    if (params.get("mode") === "profile") setMode("profile");
  }, [params]);

  const connected = wallet.status === "connected";

  return (
    <div className="shell">
      <PageHead
        index="006"
        label="Verify"
        title={mode === "verify" ? "Adjudicate a copy" : "Profile an edition"}
        lede={
          mode === "verify"
            ? "Point the contract at photographs of your copy. It works through the checklist one point at a time, and every verdict is re-derived by validators before it is written."
            : "Research the points of issue for an edition once. Every later verification of that edition reuses this profile, so the registry gets cheaper as it grows."
        }
        right={<span className="hud">{NETWORK_KEY}</span>}
      />

      <div className="row" style={{ gap: 6, marginBottom: 30 }}>
        <ModeButton active={mode === "verify"} onClick={() => setMode("verify")}>
          Verify a copy
        </ModeButton>
        <ModeButton active={mode === "profile"} onClick={() => setMode("profile")}>
          Profile an edition
        </ModeButton>
      </div>

      {!HAS_CONTRACT ? (
        <Notice tone="bad">
          No contract address configured. Run <code>npm run deploy:contract</code> and set{" "}
          <code>NEXT_PUBLIC_CONTRACT_ADDRESS</code>.
        </Notice>
      ) : !connected ? (
        <Notice tone="warn">
          Connect a wallet to write to the registry. {IS_GASLESS ? `${NETWORK_KEY} is gasless — a session key works immediately, no funding needed.` : "Reading is open to everyone; writing needs an account."}
        </Notice>
      ) : null}

      {mode === "verify" ? (
        <VerifyForm profiles={profiles} disabled={!connected || !HAS_CONTRACT} router={router} />
      ) : (
        <ProfileForm disabled={!connected || !HAS_CONTRACT} onCreated={() => void listProfiles(0, 48).then(setProfiles)} />
      )}

      <div style={{ height: 90 }} />
    </div>
  );
}

/* ----------------------------------------------------------------- forms */

function VerifyForm({
  profiles,
  disabled,
  router,
}: {
  profiles: Profile[];
  disabled: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const wallet = useWallet();
  const params = useSearchParams();

  const [profileId, setProfileId] = useState("");
  const [images, setImages] = useState("");
  const [note, setNote] = useState("");
  const run = useTransaction();

  useEffect(() => {
    const requested = params.get("profile");
    if (requested) setProfileId(requested);
  }, [params]);

  useEffect(() => {
    if (!profileId && profiles.length) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  const selected = useMemo(
    () => profiles.find((profile) => profile.id === profileId) || null,
    [profiles, profileId],
  );

  const urls = images
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const badUrls = urls.filter((url) => !url.startsWith("https://"));
  const ready = Boolean(profileId) && urls.length > 0 && badUrls.length === 0;

  const submit = async () => {
    await run.execute(async () => {
      const client = wallet.getClient();
      return client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "verify_copy",
        args: [profileId, urls.join(","), note],
        value: 0n,
      });
    });
  };

  useEffect(() => {
    if (run.phase === "done" && run.result) {
      const id = String(run.result).match(/FST-\d+/)?.[0];
      if (id) router.push(`/certificate/${id}`);
    }
  }, [run.phase, run.result, router]);

  return (
    <div style={{ display: "grid", gap: "clamp(18px, 2.4vw, 32px)", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", alignItems: "start" }}>
      <div className="panel ticks panel-pad stack">
        <div>
          <label className="label" htmlFor="profile">
            Edition profile
          </label>
          {profiles.length ? (
            <select
              id="profile"
              className="field"
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id} style={{ background: "#0e0e11" }}>
                  {profile.id} — {profile.title} ({profile.year})
                </option>
              ))}
            </select>
          ) : (
            <p className="hint">
              No profiles yet. Switch to <strong>Profile an edition</strong> and create the first one.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="images">
            Photographs of your copy — one https URL per line
          </label>
          <textarea
            id="images"
            className="field"
            rows={7}
            spellCheck={false}
            placeholder={"https://…/copyright-page.jpg\nhttps://…/page-205.jpg\nhttps://…/jacket-front.jpg\nhttps://…/jacket-rear.jpg"}
            value={images}
            onChange={(event) => setImages(event.target.value)}
          />
          <p className="hint">
            Up to eight. Shoot the copyright page, the title page, each point
            location, and both sides of the dust jacket — a point the camera
            never reached comes back <span className="mono">UNREADABLE</span>,
            not as a guess.
          </p>
          {badUrls.length ? (
            <p className="hint" style={{ color: "var(--vermilion)" }}>
              {badUrls.length} entr{badUrls.length > 1 ? "ies are" : "y is"} not an https URL.
            </p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="note">
            Note for the record (optional)
          </label>
          <input
            id="note"
            className="field"
            placeholder="Provenance, condition, anything a later reader should know"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <div className="spread">
          <span className="hud">
            {urls.length}/8 photographs · {selected?.points?.length ?? 0} points to check
          </span>
          <button
            className="btn btn-accent"
            onClick={() => void submit()}
            disabled={disabled || !ready || run.busy}
          >
            {run.busy ? <span className="spin" /> : null}
            {run.busy ? "Adjudicating" : "Run verification"}
          </button>
        </div>
      </div>

      <div className="stack">
        {selected ? <ChecklistPreview profile={selected} /> : null}
        <TransactionConsole run={run} />
      </div>
    </div>
  );
}

function ProfileForm({ disabled, onCreated }: { disabled: boolean; onCreated: () => void }) {
  const wallet = useWallet();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState("");
  const [sources, setSources] = useState("");
  const run = useTransaction();

  const urls = sources
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const untrusted = urls.filter(
    (url) => !TRUSTED_HOSTS.some((host) => url.startsWith("https://") && url.includes(host)),
  );
  const ready = title.trim() && author.trim() && urls.length > 0 && untrusted.length === 0;

  const submit = async () => {
    await run.execute(async () => {
      const client = wallet.getClient();
      return client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "create_profile",
        args: [title, author, publisher, year, urls.join(",")],
        value: 0n,
      });
    });
    onCreated();
  };

  return (
    <div style={{ display: "grid", gap: "clamp(18px, 2.4vw, 32px)", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", alignItems: "start" }}>
      <div className="panel ticks panel-pad stack">
        <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
          <div style={{ flex: 2 }}>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Great Gatsby" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="year">Year</label>
            <input id="year" className="field" value={year} onChange={(e) => setYear(e.target.value)} placeholder="1925" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="author">Author</label>
          <input id="author" className="field" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="F. Scott Fitzgerald" />
        </div>

        <div>
          <label className="label" htmlFor="publisher">Publisher</label>
          <input id="publisher" className="field" value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="Charles Scribner's Sons" />
        </div>

        <div>
          <label className="label" htmlFor="sources">Reference sources — one https URL per line</label>
          <textarea
            id="sources"
            className="field"
            rows={4}
            spellCheck={false}
            placeholder="https://en.wikipedia.org/wiki/The_Great_Gatsby"
            value={sources}
            onChange={(event) => setSources(event.target.value)}
          />
          <p className="hint">
            Up to three, and only from hosts the contract trusts. An open-ended
            fetch would let whoever controls a page write the checklist.
          </p>
          {untrusted.length ? (
            <p className="hint" style={{ color: "var(--vermilion)" }}>
              {untrusted.length} source{untrusted.length > 1 ? "s are" : " is"} not on the trusted list.
            </p>
          ) : null}
        </div>

        <div className="spread">
          <span className="hud">{urls.length}/3 sources</span>
          <button className="btn btn-accent" onClick={() => void submit()} disabled={disabled || !ready || run.busy}>
            {run.busy ? <span className="spin" /> : null}
            {run.busy ? "Researching" : "Create profile"}
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="panel panel-pad">
          <div className="hud-b" style={{ marginBottom: 14 }}>Trusted reference hosts</div>
          <div className="row" style={{ gap: 6 }}>
            {TRUSTED_HOSTS.map((host) => (
              <span key={host} className="chip tone-muted">{host}</span>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            The contract owner can extend this list on-chain. Nothing else can.
          </p>
        </div>
        <TransactionConsole run={run} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- pieces */

function ChecklistPreview({ profile }: { profile: Profile }) {
  return (
    <div className="panel panel-pad">
      <div className="spread" style={{ marginBottom: 16 }}>
        <span className="hud-b">Checklist · {profile.id}</span>
        <span className="hud">{profile.confidence} confidence</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 42 }}>Wt</th>
            <th>Point</th>
            <th style={{ width: "26%" }}>Where</th>
          </tr>
        </thead>
        <tbody>
          {(profile.points || []).map((point) => (
            <tr key={point.id}>
              <td className="mono" style={{ color: point.weight >= 9 ? "var(--vermilion)" : "var(--grey-dim)" }}>
                {String(point.weight).padStart(2, "0")}
              </td>
              <td style={{ color: "var(--paper)" }}>{point.label}</td>
              <td className="hud" style={{ textTransform: "none" }}>{point.location || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionConsole({ run }: { run: ReturnType<typeof useTransaction> }) {
  return (
    <div className="panel panel-pad">
      <div className="spread" style={{ marginBottom: 16 }}>
        <span className="hud-b">Consensus log</span>
        {run.hash ? <span className="hud break">{run.hash.slice(0, 14)}…</span> : null}
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 11 }}>
        {STAGES.map((stage, index) => {
          const state =
            run.phase === "idle"
              ? "waiting"
              : index < run.stage
                ? "done"
                : index === run.stage
                  ? run.phase === "failed"
                    ? "failed"
                    : "active"
                  : "waiting";
          return (
            <li key={stage} style={{ display: "flex", gap: 11, alignItems: "center" }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flex: "none",
                  background:
                    state === "done"
                      ? "var(--jade)"
                      : state === "active"
                        ? "var(--amber)"
                        : state === "failed"
                          ? "var(--vermilion)"
                          : "var(--grey-dim)",
                  opacity: state === "waiting" ? 0.4 : 1,
                }}
              />
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  letterSpacing: "0.08em",
                  color: state === "waiting" ? "var(--grey-dim)" : "var(--paper)",
                }}
              >
                {stage}
              </span>
              {state === "active" ? <span className="spin tone-warn" /> : null}
            </li>
          );
        })}
      </ol>

      {run.error ? (
        <p className="hint break" style={{ color: "var(--vermilion)", marginTop: 16 }}>
          {run.error}
        </p>
      ) : null}

      {run.phase === "idle" ? (
        <p className="hint" style={{ marginTop: 16 }}>
          A write runs live web reads and model calls inside consensus, so it
          takes appreciably longer than an ordinary transaction. Leave the tab open.
        </p>
      ) : null}
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Notice({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div
      className="panel panel-pad"
      style={{
        marginBottom: 26,
        borderColor: tone === "bad" ? "rgba(229,72,44,0.45)" : "rgba(217,164,65,0.4)",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--grey)" }}>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------- tx runner */

/**
 * Drives one contract write and exposes a coarse stage index for the console.
 * Stages are advanced on a timer because the RPC reports a single pending
 * status — they describe what the network is doing, and the log says plainly
 * when the real result lands.
 */
function useTransaction() {
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const execute = useCallback(
    async (send: () => Promise<string>) => {
      setPhase("submitting");
      setStage(0);
      setError(null);
      setResult(null);
      setHash(null);

      let ticker: ReturnType<typeof setInterval> | null = null;
      try {
        const txHash = await send();
        setHash(txHash);
        setPhase("pending");
        setStage(1);

        ticker = setInterval(() => setStage((current) => Math.min(current + 1, STAGES.length - 2)), 12000);

        const receipt = await wallet.getClient().waitForTransactionReceipt({
          hash: txHash as never,
          status: TransactionStatus.ACCEPTED,
          interval: 4000,
          retries: 150,
        });

        if (ticker) clearInterval(ticker);
        setStage(STAGES.length);

        const returned =
          receipt?.consensus_data?.leader_receipt?.[0]?.result ??
          receipt?.data?.execution_result ??
          receipt?.data ??
          "";

        setResult(typeof returned === "string" ? returned : JSON.stringify(returned));
        setPhase("done");
      } catch (err) {
        if (ticker) clearInterval(ticker);
        setPhase("failed");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [wallet],
  );

  return {
    phase,
    stage,
    hash,
    error,
    result,
    busy: phase === "submitting" || phase === "pending",
    execute,
  };
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="shell" style={{ paddingTop: 120 }} />}>
      <VerifyBody />
    </Suspense>
  );
}
