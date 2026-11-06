#!/usr/bin/env node
/**
 * Rebuild snapshot.json for the Tacit two-clock explorer.
 *
 * Every number on the page comes from either
 *   (a) eth_getLogs over the ConfidentialPool's full lifetime, or
 *   (b) a single eth_call / Bitcoin tip read at build time.
 * Nothing is estimated.
 *
 * usage: node tools/build_snapshot.mjs [rpcUrl]
 *   default rpcUrl: https://ethereum-rpc.publicnode.com
 *   the free public nodes cap eth_getLogs at ~100k blocks and few results,
 *   so pass a paid/archive endpoint for the full 356k-block range.
 */
import { writeFileSync } from 'node:fs';

const RPC = process.argv[2] || 'https://ethereum-rpc.publicnode.com';
const POOL = '0x000000000Ed1eabD231Be41d93b719056F7febFC';
const RELAY = '0x20A6ddc2C6E620c6248B5A34E85996516FDd19D0';
const TAC = '0xA1313eb9f3A445606D9583bcAc3ebeB56a858279';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WSTETH = '0x7f39C581F595B53c5cb19Bd0b3f8dA6c935E2Ca0';
const DEPLOY_BLOCK = 25998751; // first block with code at POOL

const TOPICS = {
  'Wrap(bytes32,bytes32,uint256)': 'Wrap',
  'LeavesInserted(uint256,bytes32[],bytes[])': 'LeavesInserted',
  'NullifiersSpent(bytes32[])': 'NullifiersSpent',
  'LockLeavesInserted(uint256,bytes32[])': 'LockLeavesInserted',
  'CrossOutRecorded(bytes32,uint16,bytes32,bytes32,bytes32)': 'CrossOutRecorded',
  'BitcoinNotesConsumed(bytes32[],bytes32)': 'BitcoinNotesConsumed',
  'CdpPositionInserted(bytes32)': 'CdpPositionInserted',
  'AssetRegistered(bytes32,address,uint256,string,string,uint8)': 'AssetRegistered',
};

// ── minimal keccak-256 (BigInt lanes), enough for event topic0 ──────────────
const RC = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
  0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
  0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
  0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
  0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
  0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
const R = [[0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]];
const M58 = (1n << 64n) - 1n;
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M58;
function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const C = [0, 1, 2, 3, 4].map(x => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) s[y + x] ^= D; }
    const B = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], R[x][y]);
    for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) s[y + x] = B[y + x] ^ ((~B[y + (x + 1) % 5] & M58) & B[y + (x + 2) % 5]);
    s[0] ^= RC[round];
  }
}
function keccak256(bytes) {
  const rate = 136, s = new Array(25).fill(0n);
  const pad = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  pad.set(bytes); pad[bytes.length] = 0x01; pad[pad.length - 1] |= 0x80;
  for (let off = 0; off < pad.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(pad[off + i * 8 + b]);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  let out = '';
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out += ((s[i] >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, '0');
  return '0x' + out;
}
const TOPIC_OF = {};
for (const sig of Object.keys(TOPICS)) TOPIC_OF[keccak256(Buffer.from(sig, 'utf8'))] = TOPICS[sig];

// ── rpc ────────────────────────────────────────────────────────────────────
let id = 0;
async function rpc(method, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(RPC, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 200)}`);
    return j.result;
  }
}
const words = (hex) => {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = []; for (let i = 0; i < h.length; i += 64) out.push(h.slice(i, i + 64)); return out;
};
const u = (w) => BigInt('0x' + w);
const at = (w, i) => Number(u(w[i]) / 32n);          // offset of dynamic arg i, in words
const arrLen = (w, i) => { const o = at(w, i); return w[o] === undefined ? 0 : Number(u(w[o])); };
const strAt = (w, o) => {
  const len = Number(u(w[o])); let hex = '';
  for (let k = 1; k <= Math.ceil(len / 32); k++) hex += w[o + k];
  return Buffer.from(hex.slice(0, len * 2), 'hex').toString('utf8');
};

// ── logs, full lifetime, adaptive chunking ─────────────────────────────────
async function allLogs(from, to) {
  const logs = []; let start = from, step = 100000;
  while (start <= to) {
    const end = Math.min(start + step - 1, to);
    try {
      const batch = await rpc('eth_getLogs', [{ address: POOL, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16) }]);
      logs.push(...batch);
      start = end + 1;
    } catch (e) {
      if (step <= 20000) throw e;
      step = Math.floor(step / 2);
      console.error(`   range too large, halving to ${step} blocks`);
    }
  }
  return logs;
}

const head = parseInt(await rpc('eth_blockNumber', []), 16);
console.error(`pool logs ${DEPLOY_BLOCK}..${head}`);
const logs = await allLogs(DEPLOY_BLOCK, head);
console.error(`  ${logs.length} logs`);

// ── aggregate ──────────────────────────────────────────────────────────────
const assets = {}; const wrapN = {}; const wrapRaw = {};
let notesCreated = 0, notesSpent = 0, locks = 0, cdp = 0, btcNotes = 0;
const roots = new Set(); const cross = {}; const byBlock = [];

for (const lg of logs) {
  const kind = TOPIC_OF[lg.topics[0]];
  const w = words(lg.data); const tp = lg.topics; const bn = parseInt(lg.blockNumber, 16);
  if (kind === 'AssetRegistered') {
    assets['0x' + tp[1].slice(-64)] = {
      name: strAt(w, at(w, 1)), symbol: strAt(w, at(w, 2)),
      unitScale: u(w[0]).toString(), decimals: Number(u(w[3])),
      underlying: '0x' + tp[2].slice(-40),
    };
  } else if (kind === 'LeavesInserted') { const c = arrLen(w, 0); notesCreated += c; byBlock.push([bn, c, 0]); }
  else if (kind === 'NullifiersSpent') { const c = arrLen(w, 0); notesSpent += c; byBlock.push([bn, 0, c]); }
  else if (kind === 'LockLeavesInserted') locks += arrLen(w, 0);
  else if (kind === 'CdpPositionInserted') cdp += 1;
  else if (kind === 'BitcoinNotesConsumed') { btcNotes += arrLen(w, 0); roots.add('0x' + w[1]); }
  else if (kind === 'CrossOutRecorded') {
    const assetId = '0x' + w[3].slice(-64);
    const sym = assets[assetId]?.symbol ?? '(unregistered)';
    const dest = Number(u(w[0]));
    cross[`${sym}:${dest}`] = (cross[`${sym}:${dest}`] ?? 0) + 1;
  } else if (kind === 'Wrap') {
    const assetId = '0x' + tp[2].slice(-64);
    wrapN[assetId] = (wrapN[assetId] ?? 0) + 1;
    wrapRaw[assetId] = (wrapRaw[assetId] ?? 0n) + u(w[0]);
  }
}

const assetRows = Object.keys(wrapN).map((assetId) => {
  const a = assets[assetId]; const dec = a?.decimals ?? 18; const raw = wrapRaw[assetId];
  return {
    assetId, symbol: a?.symbol ?? '(unregistered)', name: a?.name ?? 'assetId not in this generation’s registry',
    decimals: dec, underlying: a?.underlying ?? null, wraps: wrapN[assetId],
    volume_raw: raw.toString(), volume: Number(raw) / 10 ** dec,
  };
}).sort((x, y) => y.volume - x.volume);

// weekly buckets over equal block spans
const NB = 8, span = (head - DEPLOY_BLOCK + 1) / NB;
const weeks = Array.from({ length: NB }, (_, i) => ({
  from: Math.floor(DEPLOY_BLOCK + i * span), created: 0, spent: 0,
}));
for (const [bn, c, s] of byBlock) {
  const i = Math.min(NB - 1, Math.floor((bn - DEPLOY_BLOCK) / span));
  if (i >= 0) { weeks[i].created += c; weeks[i].spent += s; }
}
for (const wk of weeks) {
  const blk = await rpc('eth_getBlockByNumber', ['0x' + wk.from.toString(16), false]);
  wk.label = new Date(Number(BigInt(blk.timestamp)) * 1000).toISOString().slice(0, 10);
}

// ── live reads at build time ───────────────────────────────────────────────
const sel = (sig) => keccak256(Buffer.from(sig, 'utf8')).slice(0, 10);
const SEL = { tipHeight: sel('tipHeight()'), totalSupply: sel('totalSupply()'), balanceOf: sel('balanceOf(address)') };
async function ethCall(to, data) { return rpc('eth_call', [{ to, data }, 'latest']); }
const num = (hex) => Number(BigInt(hex)) / 1e18;
const bal = (token, who) => ethCall(token, SEL.balanceOf + who.slice(2).toLowerCase().padStart(64, '0'));
const btcTip = Number(await (await fetch('https://mempool.space/api/blocks/tip/height')).text());

const snapshot = {
  meta: {
    built_at: new Date().toISOString(), eth_block: head, pool: POOL, relay: RELAY,
    deploy_block: DEPLOY_BLOCK, logs: logs.length,
    source: 'eth_getLogs(address=ConfidentialPool) over its full lifetime',
  },
  live_build: {
    relay_tip: Number(BigInt(await ethCall(RELAY, SEL.tipHeight))),
    btc_tip: btcTip,
    pool_eth: num(await rpc('eth_getBalance', [POOL, 'latest'])),
    pool_usdc: Number(BigInt(await bal(USDC, POOL))) / 1e6,
    pool_wsteth: num(await bal(WSTETH, POOL)),
    pool_tac: num(await bal(TAC, POOL)),
    tac_supply: num(await ethCall(TAC, SEL.totalSupply)),
  },
  totals: { wraps: Object.values(wrapN).reduce((a, b) => a + b, 0), notes_created: notesCreated, notes_spent: notesSpent, locks, cdp, crossouts: Object.values(cross).reduce((a, b) => a + b, 0), btc_notes: btcNotes, btc_roots: roots.size },
  assets: assetRows,
  cross: Object.entries(cross).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n),
  weeks: weeks.map(({ label, created, spent }) => ({ label, created, spent })),
};

writeFileSync(new URL('../snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 1));
console.error(`wrote snapshot.json — ${snapshot.totals.wraps} wraps, ${logs.length} logs, block ${head}`);
console.log(JSON.stringify(snapshot.totals));
