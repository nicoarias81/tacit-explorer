# Tacit Explorer

Single-page, read-only explorer for the **Tacit** system (https://github.com/src-company/tacit), showing one system across its two chains:

- **Bitcoin lane** — Taproot envelopes: etches, transfers, mints and burns of confidential assets; header-relay status; bridge burns/mints in flight.
- **Ethereum / Base lane** — the confidential pools (Groth16 `transact`): tree entries (leaves / nullifiers / wraps), all-time wrapped volume per asset, recent pool events with tx links, on-chain pool custody and tree root via public RPCs.
- **The bridge** — relay tip height, burns vs mints in flight, burn deposits.
- **The lifetime ledger** — the same pool decoded a second way: not from the indexer, but from the pool's own event logs (14,578 logs from deployment to build head). Wraps, ETH deposited, notes minted vs spent per week, wrapped volume per asset, cross-outs, Bitcoin notes consumed — and a live cross-check that puts the indexer's counts next to ours.
- **Privacy frontier** — an explicit public-vs-hidden table: what is public (timing, counts, fees, addresses, wrap amounts) and what stays hidden (amounts inside notes, links between notes, note ownership).
- **Lookup** — `tacit1…` unified address (decoded locally, sent nowhere), txid (checked on mempool.space and against the fetched confidential index), EVM address (on-chain XNS reverse name + balances), Bitcoin address, and XNS names like `vitalik@eth` resolved on-chain via `getAddress()` on XNSv2.

Live at: **https://nicoarias81.github.io/tacit-explorer/**

## Endpoints used (all public, no keys)

| Source | Used for | CORS for this page |
|---|---|---|
| `https://api.tacit.finance/reflection/status` | header relay height, bridge burns/mints, live notes | allows `*` |
| `https://api.tacit.finance/confidential/index?from=N` | full event index of the Ethereum ConfidentialPool (~14k entries) | allows `*` |
| `https://api.tacit.finance/confidential/quote` | fee floors / wrap and prove tips | allows `*` |
| `https://api.tacit.finance/assets`, `/amm/pools` | etched assets, AMM reserves | **snapshot only** — route allows CORS to `tacit.finance` origins |
| `https://mempool.space/api/...` | Bitcoin tip, tx/address lookup | allows `*` |
| `https://mainnet.base.org` (POST) | Base pool tree root/size, custody balance | origin echoed |
| `https://ethereum-rpc.publicnode.com` (POST) | Ethereum pool balance, XNS resolution | allows `*` |
| `https://tacit-evm-pool-keeper-base.onrender.com/evm-pool/keeper/quote` | Base relayer fee quote | allows `*` |

`data/assets-mainnet.json` and `data/amm-pools-mainnet.json` are raw build-time snapshots of the indexer's mainnet `/assets` and `/amm/pools` responses (taken 2026-11-05), used because those routes' CORS policy does not allow third-party origins. Everything else is fetched live by your browser on every page load.

## Reproducing the lifetime ledger

`data/lifetime.json` is a build-time artifact. `tools/build_snapshot.mjs` rebuilds it from any Ethereum RPC (Node 18+, zero dependencies, its own keccak):

```
node tools/build_snapshot.mjs https://ethereum-rpc.publicnode.com
```

It walks `eth_getLogs` for the pool in adaptive chunks from block 25,998,751 to head, decodes `Wrap`, `LeavesInserted`, `NullifiersSpent`, `CrossOutRecorded` and `BitcoinNotesConsumed`, then reads the relay tip and the pool's custody balance with `eth_call`. The build that produced the committed file: 14,578 logs, block 26,354,927, 2026-11-06 09:31 UTC.

Two numbers in that ledger are worth flagging honestly: notes spent (5,988) exceeds notes minted (5,823), because nullifiers can spend notes committed in earlier generations of the pool; and some `Wrap` entries carry assetIds the current registry no longer answers for, so they are shown as *unregistered* instead of being mapped to a guess.

## Public vs private

Public (shown here): tx existence and timing, counts of leaves/nullifiers/wraps/cross-outs and bridge burns/mints, fees and tips, deposit addresses, wrap amounts and assets, memo byte existence, tree root and size.

Hidden (never faked): note amounts, note ownership, which leaf a nullifier spends, memos' decrypted contents, post-withdrawal flows.

## Safety

This page is read-only static HTML/JS with no backend. It never asks for a seed phrase or key, never signs, never moves funds, and `tacit1…` lookups are decoded entirely in your browser.

Not affiliated with Tacit. Data from Tacit's public indexer, mempool.space and public RPCs.
