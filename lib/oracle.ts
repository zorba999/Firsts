/**
 * Typed access to the FirstsOracle contract.
 *
 * The contract returns JSON strings rather than structured calldata so the ABI
 * stays flat and the frontend can evolve its rendering without a redeploy.
 * Everything crossing that boundary is parsed defensively here, in one place.
 */

import { createClient } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { CHAIN, CONTRACT_ADDRESS, HAS_CONTRACT } from "./chain";

export type Verdict =
  | "VERIFIED_FIRST_PRINTING"
  | "LIKELY_FIRST_PRINTING"
  | "NOT_FIRST_PRINTING"
  | "MARRIED_COPY_SUSPECTED"
  | "INSUFFICIENT_EVIDENCE";

export type PointVerdict = "MATCH" | "NO_MATCH" | "UNREADABLE";

export type ProfilePoint = {
  id: string;
  kind: string;
  label: string;
  location: string;
  first_state: string;
  later_state: string;
  weight: number;
};

export type Profile = {
  id: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  sources: string[];
  points: ProfilePoint[];
  confidence: "high" | "medium" | "low";
  registered_by: string;
};

export type CertificatePoint = {
  id: string;
  kind: string;
  label: string;
  location: string;
  weight: number;
  verdict: PointVerdict;
  evidence: string;
};

export type Certificate = {
  id: string;
  profile_id: string;
  title: string;
  author: string;
  publisher: string;
  year: string;
  holder: string;
  note: string;
  images: string[];
  images_used: number;
  verdict: Verdict;
  score_bp: number;
  coverage_bp: number;
  book_bp: number;
  jacket_bp: number;
  unreadable: number;
  points: CertificatePoint[];
  challenge_count: number;
};

export type Challenge = {
  point_id: string;
  by: string;
  reason: string;
  verdict_before: PointVerdict;
  verdict_after: PointVerdict;
  certificate_before: Verdict;
  certificate_after: Verdict;
  upheld: boolean;
};

export type Stats = {
  profiles: number;
  certificates: number;
  verified: number;
  rejected: number;
  trusted_sources: number;
  paused: boolean;
  owner: string;
};

export const VERDICT_META: Record<Verdict, { label: string; tone: "good" | "warn" | "bad" | "muted"; blurb: string }> = {
  VERIFIED_FIRST_PRINTING: {
    label: "Verified first printing",
    tone: "good",
    blurb: "Every decisive point agrees, and enough of the copy was legible to say so.",
  },
  LIKELY_FIRST_PRINTING: {
    label: "Likely first printing",
    tone: "warn",
    blurb: "The points that could be read agree, but coverage is thin. Re-shoot the gaps.",
  },
  MARRIED_COPY_SUSPECTED: {
    label: "Married copy suspected",
    tone: "bad",
    blurb: "The book reads as a first printing; the jacket does not. The jacket carries most of the value.",
  },
  NOT_FIRST_PRINTING: {
    label: "Not a first printing",
    tone: "bad",
    blurb: "At least one decisive point contradicts the first-printing state.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    tone: "muted",
    blurb: "Too much of the copy was unreadable to reach any verdict. Nothing was decided.",
  },
};

export const POINT_VERDICT_META: Record<PointVerdict, { label: string; tone: "good" | "bad" | "muted" }> = {
  MATCH: { label: "Match", tone: "good" },
  NO_MATCH: { label: "No match", tone: "bad" },
  UNREADABLE: { label: "Unreadable", tone: "muted" },
};

let readClient: GenLayerClient<typeof CHAIN> | null = null;

export function getReadClient(): GenLayerClient<typeof CHAIN> {
  if (!readClient) {
    readClient = createClient({ chain: CHAIN }) as GenLayerClient<typeof CHAIN>;
  }
  return readClient;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function read<T>(functionName: string, args: unknown[], fallback: T): Promise<T> {
  if (!HAS_CONTRACT) return fallback;
  try {
    const raw = await getReadClient().readContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args: args as never,
    });
    return parse<T>(raw, fallback);
  } catch {
    return fallback;
  }
}

export const EMPTY_STATS: Stats = {
  profiles: 0,
  certificates: 0,
  verified: 0,
  rejected: 0,
  trusted_sources: 0,
  paused: false,
  owner: "",
};

export const getStats = () => read<Stats>("get_stats", [], EMPTY_STATS);

export const listProfiles = (offset = 0, limit = 24) =>
  read<Profile[]>("list_profiles", [offset, limit], []);

export const listCertificates = (offset = 0, limit = 24) =>
  read<Certificate[]>("list_certificates", [offset, limit], []);

export const getProfile = (id: string) => read<Profile | null>("get_profile", [id], null);

export const getCertificate = (id: string) =>
  read<Certificate | null>("get_certificate", [id], null);

export const getChallenges = (certId: string) =>
  read<Challenge[]>("get_challenges", [certId], []);

/** Basis points → a percentage string, no floating-point surprises. */
export const bp = (value: number | undefined) =>
  `${Math.round(((value ?? 0) / 10000) * 100)}%`;
