/**
 * Seed the registry with a few bibliographic profiles so the UI has real
 * on-chain data to render.
 *
 *   node scripts/seed.mjs
 *
 * Each call does live web reads plus LLM work inside consensus, so a profile
 * takes a while and the calls are deliberately run one at a time — StudioNet is
 * rate limited per IP and caps in-flight transactions per sender.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, createAccount } from "genlayer-js";
import * as chains from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const BOOKS = [
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    publisher: "Charles Scribner's Sons",
    year: "1925",
    sources: "https://en.wikipedia.org/wiki/The_Great_Gatsby",
  },
  {
    title: "The Hobbit",
    author: "J. R. R. Tolkien",
    publisher: "George Allen & Unwin",
    year: "1937",
    sources: "https://en.wikipedia.org/wiki/The_Hobbit",
  },
  {
    title: "Dune",
    author: "Frank Herbert",
    publisher: "Chilton Books",
    year: "1965",
    sources: "https://en.wikipedia.org/wiki/Dune_(novel)",
  },
];

async function main() {
  loadEnv();

  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!address) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing — deploy first");

  const account = createAccount(process.env.GENLAYER_PRIVATE_KEY);
  const chain = chains[process.env.NEXT_PUBLIC_GENLAYER_NETWORK === "localnet" ? "localnet" : "studionet"];
  const client = createClient({ chain, account });

  console.error(`contract : ${address}`);
  console.log(`sender   : ${account.address}\n`);

  // Skip anything already on-chain — profiles are shared, and a duplicate only
  // burns a slow consensus round for everyone.
  const existingRaw = await client.readContract({
    address,
    functionName: "list_profiles",
    args: [0, 50],
  });
  const existing = new Set(
    (JSON.parse(String(existingRaw) || "[]") || []).map((entry) =>
      String(entry.title).toLowerCase(),
    ),
  );

  for (const book of BOOKS) {
    if (existing.has(book.title.toLowerCase())) {
      console.error(`${book.title} (${book.year}) … already profiled, skipping`);
      continue;
    }
    console.error(`${book.title} (${book.year}) … submitting`);
    try {
      const hash = await client.writeContract({
        address,
        functionName: "create_profile",
        args: [book.title, book.author, book.publisher, book.year, book.sources],
        value: 0n,
      });
      const receipt = await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 120,
      });
      const returned = receipt?.data?.execution_result ?? receipt?.consensus_data ?? "";
      console.error(`   accepted  tx=${hash}`);
      if (typeof returned === "string" && returned) console.error(`   ${returned}`);
    } catch (error) {
      console.error(`   failed: ${error?.message || error}`);
    }
  }

  const stats = await client.readContract({
    address,
    functionName: "get_stats",
    args: [],
  });
  console.log(`\nstats: ${stats}`);
}

main().catch((error) => {
  console.error(`seed failed: ${error?.message || error}`);
  process.exit(1);
});
