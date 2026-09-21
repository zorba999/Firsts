# FIRSTS

A points-of-issue oracle for rare first-edition books, built on **GenLayer**.

Telling a true first printing from a later one is not intuition — it is a
checklist of concrete, photographable details that the publisher changed
between impressions. That checklist lives in out-of-print bibliographies and in
the memory of a few hundred specialists. FIRSTS puts it on-chain, adjudicates a
copy against it point by point, and mints a certificate that outlives whoever
issued it.

- **Network:** GenLayer StudioNet (gasless)
- **Contract:** `0x15B135ab6DeAA7835D1726b24F533174A6E631D1`
- **Frontend:** Next.js 16 · GSAP · Lenis · deploys to Vercel as-is

---

## Why this needs GenLayer

The contract has to settle a question that is neither a lookup nor pure code: *does
this photograph show the first-printing state of this detail?* That is a
judgment, it depends on live web evidence, and money rides on the answer — which
is exactly the boundary GenLayer is built for.

The design rule throughout is to keep the non-deterministic surface as small as
it can be:

| Step | Who decides | Why |
|---|---|---|
| Extract points of issue from references | LLM + validators | Open-ended reading of unstructured sources |
| Adjudicate one point against photographs | Vision LLM + validators | Genuine visual judgment, three-valued answer |
| Turn per-point answers into a verdict | **Plain Python** | A verdict a buyer relies on must be recomputable by anyone |
| Record, challenge, rescore | Contract state | Permanent and correctable |

### Equivalence principles

Both write paths use `gl.vm.run_nondet_unsafe` with a hand-written validator, so
validators never read the leader's answer and accept it — they redo the work.

**`create_profile`** is open-ended extraction. Validators run different models,
and two correct bibliographers describe the same typo in different sentences, so
comparing prose fails consensus every time. Agreement is measured on what
survives rewording:

1. **Decisive structure** — did both runs find a point that settles the question
   on its own (a number line or copyright statement)?
2. **Families of mark** — `number_line`, `jacket`, `typo`, `binding`… compared as
   a set with a Jaccard floor.
3. **Numbers cited** — page numbers, years, jacket prices, which survive a change
   of model.

A leader that invented points or profiled a different edition fails all three.

**`verify_copy`** is a settlement decision, so it is compared strictly: the set of
points must match exactly, and a `MATCH` against a `NO_MATCH` is never tolerated.
Only `MATCH`-vs-`UNREADABLE` splits are allowed, and only a few — whether a
detail is legible in a photograph is genuinely marginal.

### Things learned the hard way

Each of these cost a redeploy, and the fixes are commented in the contract:

- **Prose comparison never reaches consensus.** The first version compared point
  signatures built from label words and got `disagree` from every validator.
- **Raw image bytes fail with `INVALID_IMAGE`.** Several hosts (Wikimedia among
  them) answer an unfamiliar client with an HTML block page carrying a 200.
  The contract now sends a User-Agent and checks magic bytes, so the submitter
  gets an error naming the host instead of an opaque VM failure.
- **Rendering each photograph in a browser is too slow.** It sidesteps every
  format problem and pushes the leader past its time budget — the transaction
  is cancelled with `max_recovery_cycles_exceeded` after three rotations.
- **`TreeMap` raises on a missing key.** It does not create a default, so index
  buckets need `get_or_insert_default`.

---

## Layout

```
contracts/firsts_oracle.py   the intelligent contract
scripts/deploy.mjs           deploy to StudioNet, writes the address into .env.local
scripts/seed.mjs             profile a few editions so the UI has real data
lib/                         chain config, wallet adapter, typed contract access
components/                  motion primitives, chrome, hero, pinned pipeline
app/                         landing · /registry · /verify · /certificate/[id]
```

---

## Running it

```bash
npm install
```

Copy the env template and put your key in it:

```bash
cp .env.example .env.local
```

```
GENLAYER_PRIVATE_KEY=0x…          # server-only, never NEXT_PUBLIC_
NEXT_PUBLIC_GENLAYER_NETWORK=studionet
NEXT_PUBLIC_CONTRACT_ADDRESS=0x…  # filled in by the deploy script
```

Lint, deploy, seed, run:

```bash
pip install genvm-linter && genvm-lint check contracts/firsts_oracle.py
```

```bash
npm run deploy:contract
```

```bash
npm run seed
```

```bash
npm run dev
```

`deploy:contract` writes `NEXT_PUBLIC_CONTRACT_ADDRESS` back into `.env.local`
for you. StudioNet is gasless, so a zero GEN balance is expected and nothing
needs funding.

### Deploying the frontend to Vercel

Import the repository and set **one** environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_GENLAYER_NETWORK` | `studionet` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | the deployed address |

`GENLAYER_PRIVATE_KEY` is **not** needed in Vercel — it only signs deploys from
your machine. Nothing else to configure; there is no server route, no database
and no build-time chain call.

---

## The wallet adapter

Two connectors behind one interface, so pages only ever ask for `getClient()`:

- **Browser wallet** — MetaMask or any EIP-6963 wallet, signing through the
  GenLayer snap. Keys stay in the user's wallet.
- **Session key** — a keypair generated in the browser and kept in
  localStorage. StudioNet is gasless, so it can write immediately with no
  install, no faucet and no seed phrase.

The session key is a convenience for trying a test network and the UI says so.
Nothing of value should sit behind it.

---

## Contract surface

| Write | Does |
|---|---|
| `create_profile(title, author, publisher, year, source_urls)` | Research an edition's points of issue from trusted references |
| `verify_copy(profile_id, image_urls, note)` | Adjudicate a copy and mint a certificate |
| `challenge_point(cert_id, point_id, reason)` | Re-adjudicate one disputed point and rescore |
| `add_trusted_source(host)` | Owner only — extend the reference allowlist |
| `set_paused(value)` | Owner only |

| Read | Returns |
|---|---|
| `get_profile` · `list_profiles(offset, limit)` | Edition profiles as JSON |
| `get_certificate` · `list_certificates(offset, limit)` | Certificates as JSON |
| `list_certificates_for_profile` · `list_certificates_for_holder` | Id arrays |
| `get_challenges(cert_id)` | Challenge history |
| `get_stats()` | Registry counters |

Views return JSON strings rather than structured calldata, so the ABI stays flat
and the frontend can change how it renders a certificate without a redeploy.

### Verdicts

| Verdict | Meaning |
|---|---|
| `VERIFIED_FIRST_PRINTING` | Every decisive point agrees, with enough of the copy legible to say so |
| `LIKELY_FIRST_PRINTING` | What could be read agrees, but coverage is thin |
| `MARRIED_COPY_SUSPECTED` | The book reads as a first printing; the jacket does not |
| `NOT_FIRST_PRINTING` | A decisive point contradicts the first-printing state |
| `INSUFFICIENT_EVIDENCE` | Too much was unreadable to decide anything |

`MARRIED_COPY_SUSPECTED` is the one worth the build: a later dust jacket on an
early book is the most profitable quiet fraud in the trade, the jacket carries
most of the value, and almost nobody checks the two separately.

---

## Security notes

- **Prompt injection.** Reference pages are fetched only from an on-chain
  allowlist that only the owner can extend, and fetched text is fenced and
  explicitly demoted to data in the prompt. An open-ended fetch would let
  whoever controls a page write the checklist.
- **Photographs are untrusted too.** The per-point prompt states that text
  visible inside an image is data, never an instruction.
- **Bounded work.** Sources, photographs and points are all capped so a large
  profile cannot push a transaction past the compute budget.
- **No floats.** All scoring is integer basis points; floats are
  hardware-dependent and the linter rejects them.
- **Errors are classified.** `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]` and
  `[LLM_ERROR]` prefixes tell validators how to compare failures, so the network
  agrees on failure paths instead of rotating forever.

---

## What this is not

It will not catch a good forgery. Paper stock, ink ageing, binding structure and
thread count do not survive a photograph, and a forger with the right stock will
pass this and fail a bibliographer holding the book.

It is a **screening layer and a provenance ledger**: it settles the obvious
majority in minutes, flags married copies, and hands the specialist only the
cases that are genuinely hard. Treat a certificate as evidence, not as an
appraisal.
