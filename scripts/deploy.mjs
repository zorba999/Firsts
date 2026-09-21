/**
 * Deploy FirstsOracle to GenLayer StudioNet.
 *
 *   node scripts/deploy.mjs
 *
 * StudioNet is gasless, so a zero GEN balance is expected and fine. The private
 * key is read from GENLAYER_PRIVATE_KEY in .env.local and never leaves this
 * process — it is a server-side deploy key, not something the dApp ships.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
      if (!match) continue;
      if (process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

function pickChain(name) {
  const table = {
    studionet: chains.studionet,
    localnet: chains.localnet,
    "testnet-asimov": chains.testnetAsimov,
    "testnet-bradbury": chains.testnetBradbury,
  };
  const chain = table[name];
  if (!chain) {
    throw new Error(`unknown network "${name}" — expected one of ${Object.keys(table).join(", ")}`);
  }
  return chain;
}

function writeContractAddress(address) {
  const path = resolve(root, ".env.local");
  const line = `NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`;
  let body = existsSync(path) ? readFileSync(path, "utf8") : "";
  body = /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m.test(body)
    ? body.replace(/^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m, line)
    : `${body.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(path, body.startsWith("\n") ? body.slice(1) : body, "utf8");
}

async function main() {
  loadEnv();

  const privateKey = process.env.GENLAYER_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("GENLAYER_PRIVATE_KEY missing or malformed in .env.local");
  }

  const networkName = process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "studionet";
  const chain = pickChain(networkName);
  const account = createAccount(privateKey);
  const client = createClient({ chain, account });

  const code = readFileSync(resolve(root, "contracts/firsts_oracle.py"), "utf8");

  console.log(`network  : ${chain.name} (chainId ${chain.id})`);
  console.log(`rpc      : ${chain.rpcUrls.default.http[0]}`);
  console.log(`deployer : ${account.address}`);
  console.log(`contract : contracts/firsts_oracle.py (${code.length} bytes)`);
  console.log("\ndeploying…");

  const hash = await client.deployContract({ code, args: [] });
  console.log(`tx       : ${hash}`);

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 4000,
    retries: 90,
  });

  const address =
    receipt?.data?.contract_address ??
    receipt?.contract_address ??
    receipt?.data?.contractAddress;

  if (!address) {
    console.error("\nno contract address in receipt — execution likely failed:");
    console.error(JSON.stringify(receipt, null, 2).slice(0, 4000));
    process.exit(1);
  }

  writeContractAddress(address);

  console.log(`\ndeployed : ${address}`);
  console.log("written  : NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local");
  console.log("\nSet the same variable in your Vercel project settings before deploying the frontend.");
}

main().catch((error) => {
  console.error(`\ndeploy failed: ${error?.message || error}`);
  if (error?.cause) console.error(error.cause);
  process.exit(1);
});
