# Crypto Loan

Two independent npm projects, each with its own install:

- **`blockchain/`** — Solidity contracts + Hardhat (deploy, test, verify)
- **`web/`** — Next.js app (frontend + API routes + Prisma)

## Prerequisites

- Node version pinned in `.nvmrc` (currently 20). `nvm use` if you have nvm.
- npm

## 1. Environment variables

Copy `.env.example` to `.env` **in both places** — the repo root (used by `blockchain/hardhat.config.ts`) and `web/` (used by Next.js/Prisma):

```bash
cp .env.example .env
cp .env.example web/.env
```

Both are real files, not symlinks, so if you change a value, update both copies. Variables:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `web/` (Prisma) | Postgres connection string (e.g. hosted Supabase) |
| `OWNER_PRIVATE_KEY` | `blockchain/` | Key used to deploy/own contracts on testnet/mainnet |
| `HARDHAT_RPC_URL` | `blockchain/` | Defaults to local Hardhat node, override for remote RPC |
| `ALCHEMY_API_KEY` | `blockchain/` | RPC provider for Sepolia/mainnet |
| `ETHERSCAN_API_KEY` | `blockchain/` | Contract verification |
| `REPORT_GAS` | `blockchain/` | Set `true` to print gas usage in tests |
| `JWT_SECRET` | `web/` | Optional locally — falls back to a dev value if unset |

## 2. Install

```bash
cd blockchain && npm i
cd ../web && npm i
```

## 3. First-time local run

Run these in order, each in its own terminal from `blockchain/`:

```bash
# Terminal A — local chain (keep running)
npm run chain

# Terminal B — deploy contracts (writes web/src/lib/contractConfig.ts)
npm run deploy:local

# optional — deploy the ICO contracts too (writes web/src/lib/icoConfig.ts)
npm run deploy:ico
```

Then start the app from `web/`:

```bash
npm run dev
```

Open http://localhost:3000.

To use the app with a wallet:
1. Add a custom network in MetaMask: RPC `http://127.0.0.1:8545`, Chain ID `31337`.
2. Import one of the private keys printed by `npm run chain` into MetaMask.
3. Click "Connect Wallet" on the site.

## 4. Day-to-day

Once contracts are deployed, you only need the Hardhat node running plus `cd web && npm run dev`. If you restart the Hardhat node, you must redeploy — the deploy script enforces a fresh node (nonce 0) so contract addresses stay stable; otherwise rerun with `FORCE_DEPLOY=1`.

## 5. Database (Prisma)

`DATABASE_URL` points at a hosted Postgres. To apply migrations:

```bash
cd web
npx prisma migrate deploy   # apply existing migrations
npx prisma migrate dev      # create+apply a new migration during schema changes
```

## 6. Testnet / mainnet deploy

From `blockchain/`, with `OWNER_PRIVATE_KEY`, `ALCHEMY_API_KEY`, and `ETHERSCAN_API_KEY` set in `.env`:

```bash
npm run deploy:sepolia    # or deploy:mainnet
npm run verify:sepolia    # or verify:mainnet
```
