// Tacit Explorer — live mainnet data in your browser. Read-only, no keys, no backend.
'use strict';

var $ = function (id) { return document.getElementById(id); };
var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
var short = function (s, n) {
  n = n || 14;
  return s && s.length > n * 2 ? s.slice(0, n) + '\u2026' + s.slice(-8) : s;
};
var ETHERSCAN = 'https://etherscan.io';
var BASESCAN = 'https://basescan.org';
var ETH_RPC = 'https://ethereum-rpc.publicnode.com';
var BASE_RPC = 'https://mainnet.base.org';
var POOL_ETH = '0x000000000Ed1eabD231Be41d93b719056F7febFC';
var POOL_BASE = '0x000000c2A20657CE25f2Ba99737933D031AFBEE9';
var XNS = '0x6e797ba2d3103aF167918e71a7E01DE40D45f74b';
// eth_call selectors: nextIndex(), root() on TacitEvmPool; getAddress(string), getName(address) on XNSv2
var SEL_NEXTINDEX = '0xfc7e9c6f';
var SEL_ROOT = '0xebf0c717';
var SEL_GETADDR = '0xbf40fac1'; // getAddress(string) — keccak-verified, the previous constant reverted
var SEL_GETNAME = '0x5fd4b08a'; // getName(address) — keccak-verified
var ASSETS = {
  '0x3cba71e1114af183cdeacc6b8457a474d17529fd28704480ca799d0d03126f34': { name: 'cETH / tETH', dec: 18 },
  '0x62a20d98fc1cd20289621d1315294cb8772f934d822e404b71e1f471cf0679c8': { name: 'cBTC', dec: 8 },
  '0x8f4490dd3728b0ee904d7a67c11b37ffd463a5c7f08b79810006995ee8a9679d': { name: 'cUSD', dec: 6 },
  '0xf0bbe868af10c6c67652a99709bf32048d1aa7194efe3e9a1ef1bde43f94762b': { name: 'TAC', dec: 18 }
};

function jget(url, attempt) {
  attempt = attempt || 0;
  return fetch(url).then(function (r) {
    // the indexer rate-limits bursts; back off instead of giving up on real data
    if (r.status === 429 && attempt < 4) {
      return new Promise(function (res) { setTimeout(res, 1200 * Math.pow(2, attempt)); })
        .then(function () { return jget(url, attempt + 1); });
    }
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  });
}
function rpc(url, method, params) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params })
  }).then(function (r) { return r.json(); }).then(function (j) {
    if (j.error) throw new Error(JSON.stringify(j.error));
    return j.result;
  });
}
function set(id, text) { var el = $(id); if (el) el.textContent = text; }
function fmtUnits(raw, dec) {
  var b = BigInt(raw), base = 10n ** BigInt(dec);
  var w = b / base;
  var f = (b % base).toString().padStart(dec, '0').replace(/0+$/, '').slice(0, 8);
  return fmt(w) + (f ? '.' + f : '');
}

// ── bech32m (BIP-350), same codec as src-company/tacit dapp/tacit-address.js ──
var BECH_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
var BECH_CONST = 0x2bc830a3;
var GEN5 = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
function bechPolymod(values) {
  var chk = 1, i, j, top;
  for (i = 0; i < values.length; i++) {
    top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[i];
    for (j = 0; j < 5; j++) if ((top >>> j) & 1) chk ^= GEN5[j];
  }
  return chk;
}
function bechExpand(hrp) {
  var r = [], i;
  for (i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) >>> 5);
  r.push(0);
  for (i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) & 31);
  return r;
}
function convertBits(data, fromBits, toBits, pad) {
  var acc = 0, bits = 0, ret = [], maxv = (1 << toBits) - 1, i;
  for (i = 0; i < data.length; i++) {
    acc = (acc << fromBits) | data[i];
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; ret.push((acc >>> bits) & maxv); }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}
function hexOf(bytes) {
  return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}
function bechDecode(addr) {
  var a = addr.trim().toLowerCase(), sep, hrp, d5 = [], i, idx;
  sep = a.lastIndexOf('1');
  if (sep < 1 || sep + 7 > a.length) throw new Error('bad separator');
  hrp = a.slice(0, sep);
  for (i = sep + 1; i < a.length; i++) {
    idx = BECH_ALPHABET.indexOf(a[i]);
    if (idx === -1) throw new Error('invalid char "' + a[i] + '"');
    d5.push(idx);
  }
  if (bechPolymod(bechExpand(hrp).concat(d5)) !== BECH_CONST) throw new Error('bech32m checksum failed');
  return { hrp: hrp, d5: d5.slice(0, d5.length - 6) };
}
function bechEncode(hrp, dataBytes) {
  var d5 = convertBits(Array.prototype.slice.call(dataBytes), 8, 5, true);
  var pm = bechPolymod(bechExpand(hrp).concat(d5).concat([0, 0, 0, 0, 0, 0])) ^ BECH_CONST;
  var cs = [], i, out;
  for (i = 0; i < 6; i++) cs.push((pm >>> (5 * (5 - i))) & 31);
  out = hrp + '1';
  for (i = 0; i < d5.length + 6; i++) out += BECH_ALPHABET[(d5.concat(cs))[i]];
  return out;
}
// tacit1… unified address payload (dapp/tacit-address.js):
// [0x00][flags][BTC spend‖scan 66][EVM owner 33 if 0x02][pool keys 97 if 0x04]
var LANE_BTC = 0x01, LANE_EVM = 0x02, LANE_POOL = 0x04, EVM_IS_SPEND = 0x80;
function decodeTacitAddress(addr) {
  var dec = bechDecode(addr);
  var TACIT_HRP = { tacit: 'mainnet', tactt: 'signet', tacrt: 'regtest' };
  var POOL_HRP = { mainnet: 'bp', signet: 'tbp' };
  var network = TACIT_HRP[dec.hrp];
  if (!network) throw new Error('HRP "' + dec.hrp + '" is not a tacit unified HRP');
  var payload = convertBits(dec.d5, 5, 8, false);
  if (payload.length < 2) throw new Error('payload too short');
  var version = payload[0], flags = payload[1];
  if (version !== 0) throw new Error('unsupported version 0x' + version.toString(16));
  if (!(flags & LANE_BTC)) throw new Error('no Bitcoin lane');
  var hasEvm = !!(flags & LANE_EVM), sameSpend = !!(flags & EVM_IS_SPEND), hasPool = !!(flags & LANE_POOL);
  if (hasEvm && sameSpend) throw new Error('EVM key named twice');
  var want = 2 + 66 + (hasEvm ? 33 : 0) + (hasPool ? 97 : 0);
  if (payload.length < want) throw new Error('payload ' + payload.length + ' bytes, expected ' + want);
  var hex = function (from, len) {
    return Array.prototype.map.call(payload.slice(from, from + len),
      function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  var out = { network: network, lanes: ['bitcoin'], btc: { spend: hex(2, 33), scan: hex(35, 33) } };
  if (hasEvm) { out.evm = { owner: hex(68, 33), note: '' }; out.lanes.push('ethereum-side key'); }
  else if (sameSpend) { out.evm = { owner: out.btc.spend, note: 'EVM key = BTC spend key (flag 0x80)' }; out.lanes.push('ethereum-side key (spend)'); }
  if (hasPool) {
    var at = 68 + (hasEvm ? 33 : 0);
    var poolAddr = POOL_HRP[network] ? bechEncode(POOL_HRP[network], payload.slice(at, at + 97)) : null;
    out.pool = { keys: hex(at, 97), address: poolAddr };
    out.lanes.push('pool');
  }
  return out;
}

// ── XNS resolution (on-chain, XNSv2) ──
function encodeStr(s) {
  var bytes = Array.prototype.map.call(new TextEncoder().encode(s),
    function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  var pad = (64 - (bytes.length % 64)) % 64;
  return '0000000000000000000000000000000000000000000000000000000000000020'
    + bytes.length.toString(16).padStart(64, '0') + bytes + '0'.repeat(pad);
}
function xnsReverse(addr) {
  return rpc(ETH_RPC, 'eth_call', [{ to: XNS, data: SEL_GETNAME + addr.toLowerCase().slice(2).padStart(64, '0') }, 'latest'])
    .then(function (res) {
      var raw = res.slice(2), len = parseInt(raw.slice(64, 128), 16);
      if (!len) return null;
      var body = raw.slice(128, 128 + len * 2);
      var name = '';
      for (var i = 0; i < body.length; i += 2) name += String.fromCharCode(parseInt(body.slice(i, i + 2), 16));
      return name || null;
    });
}
function xnsResolve(name) {
  return rpc(ETH_RPC, 'eth_call', [{ to: XNS, data: SEL_GETADDR + encodeStr(name) }, 'latest'])
    .then(function (res) {
      var addr = '0x' + res.slice(-40);
      return addr === '0x' + '0'.repeat(40) ? null : addr;
    });
}

// ── sections ──
function loadBtcTip() {
  return fetch('https://mempool.space/api/blocks/tip/height')
    .then(function (r) { return r.text(); })
    .then(function (h) {
      set('btc-tip', fmt(parseInt(h, 10)));
      refreshLag();
    })
    .catch(function () { set('btc-tip', 'unavailable'); });
}
function refreshLag() {
  var tip = Number($('btc-tip').textContent.replace(/,/g, ''));
  var rt = Number($('relay-tip').textContent.replace(/,/g, ''));
  if (tip > 0 && rt > 0) set('relay-lag', fmt(tip - rt) + ' blocks behind');
}
function loadReflection() {
  return jget('https://api.tacit.finance/reflection/status').then(function (refl) {
    set('relay-tip', fmt(refl.tipHeight));
    set('bridge-burns', fmt(refl.bridgeBurns));
    set('bridge-minted', fmt(refl.bridgeMinted));
    set('bridge-flight', fmt(refl.bridgeBurns - refl.bridgeMinted) + ' in flight');
    set('burn-deposits', fmt(refl.burnDeposits));
    set('burns-awaiting', fmt(refl.burnsAwaitingBundle));
    set('crossouts-folded', fmt(refl.foldedCrossoutCount));
    set('live-notes', fmt(refl.liveNotes));
    set('reflection-updated', 'attested ' + fmt(refl.attestedHeight) + ' \u00b7 relay tip ' + fmt(refl.tipHeight)
      + ' \u00b7 lag ' + refl.lagBlocks + ' blocks \u00b7 ' + refl.confirmations + ' confirmations \u00b7 indexer updated ' + refl.updatedAt);
    refreshLag();
  }).catch(function (e) {
    set('reflection-updated', 'reflection/status unreachable: ' + e.message);
  });
}
function loadIndex() {
  var entries = [], metaShown = false;
  // the summary (total / leaves / nullifiers / wraps / head) comes with the first page:
  // show it immediately, then keep walking the index to build the per-asset volume table.
  function applyMeta(d) {
    set('idx-total', fmt(d.total));
    set('idx-leaves', fmt(d.counts.leaves));
    set('idx-nulls', fmt(d.counts.nullifiers));
    set('idx-wraps', fmt(d.counts.wraps));
    set('idx-head', fmt(d.headBlock) + ' / ' + fmt(d.indexedToBlock) + (d.synced ? ' (synced)' : ''));
  }
  function page(from, guard) {
    if (guard > 40) return Promise.resolve();
    return jget('https://api.tacit.finance/confidential/index?from=' + from).then(function (d) {
      if (!metaShown) { metaShown = true; applyMeta(d); }
      entries = entries.concat(d.entries || []);
      window.__indexEntries = entries;
      if (guard % 3 === 2) renderIndex(entries);        // progressive: table grows as pages land
      $('statusline').textContent = 'confidential index: ' + fmt(entries.length) + '/' + fmt(d.total) + ' entries';
      if (!d.entries || !d.entries.length || entries.length >= d.total) return null;
      // pace the walk: one request every ~350 ms keeps us under the indexer's burst limit
      var next = d.entries[d.entries.length - 1].seq + 1;
      return new Promise(function (res) { setTimeout(res, 350); })
        .then(function () { return page(next, guard + 1); });
    });
  }
  return page(0, 0).then(function () {
    renderIndex(entries);
    $('statusline').textContent = 'live data loaded \u00b7 confidential index '
      + fmt(entries.length) + ' entries';
  }).catch(function (e) {
    // partial data is still real data: show what we got, say what failed
    $('statusline').textContent = 'confidential index: ' + fmt(entries.length) + ' entries, then ' + e.message;
    if (!metaShown) set('idx-total', 'unavailable: ' + e.message);
    if (entries.length) renderIndex(entries);
  });
}
function renderIndex(entries) {
  var perAsset = {}, i, e;
  for (i = 0; i < entries.length; i++) {
    e = entries[i];
    if (e.type !== 'wrap') continue;
    if (!perAsset[e.assetId]) perAsset[e.assetId] = { raw: 0n, n: 0 };
    perAsset[e.assetId].raw += BigInt(e.amount);
    perAsset[e.assetId].n += 1;
  }
  var tb = $('wrap-volume').querySelector('tbody');
  tb.innerHTML = Object.keys(perAsset).map(function (id) {
    var known = ASSETS[id] || { name: 'asset ' + short(id, 8), dec: 18 };
    return '<tr><td>' + known.name + '</td><td class="mono">' + short(id, 10) + '</td><td>'
      + fmtUnits(perAsset[id].raw, known.dec) + '</td><td>' + fmt(perAsset[id].n) + '</td></tr>';
  }).join('');
  var rb = $('recent').querySelector('tbody'), html = '';
  for (i = entries.length - 1; i >= 0 && i >= entries.length - 12; i--) {
    e = entries[i];
    var detail = Object.keys(e).filter(function (k) {
      return ['seq', 'type', 'block', 'tx', 'logIndex'].indexOf(k) === -1;
    }).join(', ');
    if (e.type === 'leaves') detail = (e.leaves || []).length + ' note commit(s) at tree index ' + e.first;
    if (e.type === 'nullifiers') detail = (e.nullifiers || []).length + ' nullifier(s) published';
    if (e.type === 'wrap') {
      var known = ASSETS[e.assetId] || { name: short(e.assetId, 6), dec: 18 };
      detail = 'deposit of ' + fmtUnits(BigInt(e.amount), known.dec) + ' ' + known.name;
    }
    html += '<tr><td>' + e.seq + '</td><td>' + e.type + '</td><td>' + fmt(e.block) + '</td><td>' + detail
      + '</td><td class="mono"><a href="' + ETHERSCAN + '/tx/' + e.tx + '" target="_blank" rel="noopener">'
      + short(e.tx, 10) + '</a></td></tr>';
  }
  rb.innerHTML = html;
}
function loadQuotes() {
  var list = ['cETH', 'cBTC', 'cUSD', 'TAC'];
  list.forEach(function (asset) {
    jget('https://api.tacit.finance/confidential/quote?asset=' + asset + '&amountWei=10000000000000000')
      .then(function (q) {
        $('quotes').innerHTML += '<div class="card"><div class="k">' + q.ticker
          + '</div><div class="v small mono">floor ' + q.staticFloorUnits + ' \u2192 gas-aware ' + q.gasAwareFloorUnits
          + '</div><div class="src">wrap tip ' + q.recommendedWrapTipWei + ' wei \u00b7 prove tip '
          + q.recommendedProveTipWei + ' wei</div></div>';
      }).catch(function () {});
  });
}
function loadRpc() {
  return Promise.all([
    rpc(BASE_RPC, 'eth_blockNumber', []),
    rpc(BASE_RPC, 'eth_call', [{ to: POOL_BASE, data: SEL_NEXTINDEX }, 'latest']),
    rpc(BASE_RPC, 'eth_call', [{ to: POOL_BASE, data: SEL_ROOT }, 'latest']),
    rpc(BASE_RPC, 'eth_getBalance', [POOL_BASE, 'latest']),
    rpc(ETH_RPC, 'eth_blockNumber', []),
    rpc(ETH_RPC, 'eth_getBalance', [POOL_ETH, 'latest'])
  ]).then(function (r) {
    set('base-block', fmt(parseInt(r[0], 16)));
    set('base-head', fmt(parseInt(r[1], 16)));
    set('base-root', r[2]);
    set('base-bal', (parseInt(r[3], 16) / 1e18).toFixed(6) + ' ETH');
    set('eth-block', fmt(parseInt(r[4], 16)));
    set('eth-bal', (parseInt(r[5], 16) / 1e18).toFixed(6) + ' ETH');
  }).catch(function (e) {
    set('base-block', 'RPC error: ' + String(e.message).slice(0, 60));
    set('eth-block', 'RPC error');
  });
}
function loadKeeperQuote() {
  return jget('https://tacit-evm-pool-keeper-base.onrender.com/evm-pool/keeper/quote').then(function (q) {
    set('keeper-quote', 'Base keeper (relayer ' + q.relayer + '): fee ' + q.fee + ' wei \u00b7 gas ' + q.gas
      + ' \u00b7 sweepFee ' + q.sweepFee + ' wei \u2014 quoted live on page load.');
  }).catch(function () {});
}
function loadSnapshot() {
  return Promise.all([
    fetch('data/assets-mainnet.json').then(function (r) { return r.json(); }),
    fetch('data/amm-pools-mainnet.json').then(function (r) { return r.json(); })
  ]).then(function (r) {
    var assets = r[0], pools = r[1];
    set('asset-count', assets.count);
    set('snapshot-date', 'Snapshot taken ' + window.__SNAPSHOT_DATE + ' from api.tacit.finance (network: '
      + assets.network + ', ' + assets.count + ' assets, ' + (pools.pools || []).length + ' AMM pools).');
    renderSnapshot(assets, pools);
  }).catch(function (e) { set('snapshot-date', 'snapshot unavailable: ' + e.message); });
}
function renderSnapshot(assets, pools) {
  var byId = {}, i;
  for (i = 0; i < assets.assets.length; i++) byId[assets.assets[i].asset_id] = assets.assets[i];
  var pb = $('pools-table').querySelector('tbody');
  pb.innerHTML = (pools.pools || []).map(function (p) {
    var A = byId[p.asset_a] || { ticker: short(p.asset_a, 8), decimals: 18 };
    var B = byId[p.asset_b] || { ticker: short(p.asset_b, 8), decimals: 18 };
    return '<tr><td class="mono">' + short(p.pool_id, 12) + '</td><td>' + A.ticker + '</td><td>' + B.ticker
      + '</td><td>' + fmtUnits(BigInt(p.reserve_a), A.decimals) + '</td><td>'
      + fmtUnits(BigInt(p.reserve_b), B.decimals) + '</td><td>' + fmt(p.lp_total_shares) + '</td></tr>';
  }).join('');
  var sorted = assets.assets.slice().sort(function (a, b) {
    return (b.etched_at_height || 0) - (a.etched_at_height || 0);
  });
  var ab = $('assets-table').querySelector('tbody');
  ab.innerHTML = sorted.map(function (a) {
    return '<tr><td>' + a.ticker + '</td><td>' + a.decimals + '</td><td>' + (a.etched_at_height || '\u2014')
      + '</td><td>' + (a.mintable ? 'yes' : 'no') + '</td><td class="mono">' + short(a.asset_id, 10)
      + '</td><td class="mono"><a href="https://mempool.space/tx/' + a.etch_txid + '" target="_blank" rel="noopener">'
      + short(a.etch_txid, 8) + '</a></td></tr>';
  }).join('');
}

// ── lookup ──
var HEX64 = /^(0x)?[0-9a-fA-F]{64}$/;
var ETH_ADDR = /^0x[0-9a-fA-F]{40}$/;
var BTC_ADDR = /^(bc1[a-z0-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,62})$/;
var XNS_NAME = /^[a-zA-Z0-9][a-zA-Z0-9-]*@[a-zA-Z0-9][a-zA-Z0-9-]*$/;
var TACIT1 = /^(tacit|tactt|tacrt)1[a-z0-9]+$/i;
function doLookup() {
  var v = $('lookup-input').value.trim();
  var out = $('lookup-out');
  if (!v) return;
  out.innerHTML = '<p class="note">working\u2026</p>';
  function row(k, val) { return '<tr><td>' + k + '</td><td>' + val + '</td></tr>'; }
  var p;
  if (TACIT1.test(v)) {
    var d;
    try { d = decodeTacitAddress(v); } catch (e) {
      out.innerHTML = '<p class="warn">not a valid unified tacit address: ' + e.message + '</p>';
      return;
    }
    var html = '<h4>Unified Tacit address \u2014 decoded locally, sent nowhere</h4><table>'
      + row('network', d.network) + row('lanes', d.lanes.join(' + '))
      + row('BTC spend pubkey', d.btc.spend) + row('BTC scan pubkey', d.btc.scan);
    if (d.evm) html += row('EVM owner pubkey', d.evm.owner + (d.evm.note ? ' \u2014 ' + d.evm.note : ''));
    if (d.pool) html += row('pool keys (V\u2015A\u2015N)', d.pool.keys)
      + row('derived bp1\u2026 pool address', '<code>' + d.pool.address + '</code>');
    out.innerHTML = html + '</table><p class="note">Pubkeys only \u2014 no balance is revealed anywhere.'
      + ' This decode ran in your browser and never left it.</p>';
    return;
  }
  if (HEX64.test(v)) {
    var tx = v.toLowerCase();
    p = fetch('https://mempool.space/api/tx/' + tx).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (t) {
      var html = '<h4>64-hex string</h4>';
      if (t) {
        html += '<table>' + row('Bitcoin tx', '<a href="https://mempool.space/tx/' + tx
          + '" target="_blank" rel="noopener">mempool.space/tx/' + short(tx, 10) + '</a>')
          + row('confirmed', t.status.confirmed ? 'at height ' + fmt(t.status.block_height) : 'unconfirmed')
          + row('fee', fmt(t.fee) + ' sats')
          + row('inputs / outputs', t.vin.length + ' / ' + t.vout.length) + '</table>';
      } else {
        html += '<p>Not found on mempool.space as a Bitcoin tx.</p>';
      }
      var hits = (window.__indexEntries || []).filter(function (e) {
        return (e.tx || '').toLowerCase() === tx;
      });
      if (hits.length) {
        html += '<p><strong>In the Ethereum ConfidentialPool index:</strong></p><table>'
          + hits.map(function (e) {
            return row('seq ' + e.seq, e.type + ' \u00b7 block ' + fmt(e.block) + ' \u00b7 <a href="'
              + ETHERSCAN + '/tx/' + e.tx + '" target="_blank" rel="noopener">' + short(e.tx, 10) + '</a>');
          }).join('') + '</table>';
      }
      html += '<p class="note">EVM side: <a href="' + ETHERSCAN + '/tx/' + tx
        + '" target="_blank" rel="noopener">etherscan</a> \u00b7 <a href="' + BASESCAN + '/tx/' + tx
        + '" target="_blank" rel="noopener">basescan</a></p>';
      out.innerHTML = html;
    }).catch(function (e) { out.innerHTML = '<p class="warn">lookup failed: ' + e.message + '</p>'; });
  } else if (ETH_ADDR.test(v)) {
    var a = v.toLowerCase();
    p = rpc(ETH_RPC, 'eth_call', [{ to: XNS, data: SEL_GETNAME + a.slice(2).padStart(64, '0') }, 'latest'])
      .catch(function () { return null; })
      .then(function (res) {
        var nameStr = '';
        if (res) {
          var h = res.slice(2), ln = parseInt(h.slice(64, 128), 16) || 0;
          if (ln) {
            var raw = h.slice(128, 128 + ln * 2).match(/../g).map(function (x) { return parseInt(x, 16); });
            nameStr = new TextDecoder().decode(new Uint8Array(raw));
          }
        }
        return Promise.all([
          rpc(ETH_RPC, 'eth_getBalance', [a, 'latest']).catch(function () { return null; }),
          rpc(BASE_RPC, 'eth_getBalance', [a, 'latest']).catch(function () { return null; }),
          nameStr
        ]);
      })
      .then(function (r) {
        var html = '<h4>EVM address</h4><table>';
        if (r[2]) html += row('XNS name (on-chain)', r[2]);
        html += row('Ethereum balance', r[0] ? (parseInt(r[0], 16) / 1e18).toFixed(6) + ' ETH' : '\u2014')
          + row('Base balance', r[1] ? (parseInt(r[1], 16) / 1e18).toFixed(6) + ' ETH' : '\u2014')
          + row('explorers', '<a href="' + ETHERSCAN + '/address/' + a + '" target="_blank" rel="noopener">etherscan</a> \u00b7 <a href="'
            + BASESCAN + '/address/' + a + '" target="_blank" rel="noopener">basescan</a>')
          + '</table><p class="note">Only the address\u2019s <em>public</em> balance is visible.'
          + ' Confidential notes are invisible to every explorer, by design.</p>';
        out.innerHTML = html;
      })
      .catch(function (e) { out.innerHTML = '<p class="warn">lookup failed: ' + e.message + '</p>'; });
  } else if (XNS_NAME.test(v)) {
    p = xnsResolve(v).then(function (addr) {
      out.innerHTML = addr
        ? '<h4>XNS name \u2014 resolved on-chain (getAddress)</h4><table>' + row('name', v)
          + row('address', addr) + row('explorer', '<a href="' + ETHERSCAN + '/address/' + addr
            + '" target="_blank" rel="noopener">etherscan</a> \u00b7 <a href="' + BASESCAN + '/address/' + addr
            + '" target="_blank" rel="noopener">basescan</a>') + '</table>'
        : '<p><strong>' + v + '</strong> is not registered (getAddress returned the zero address).</p>';
    }).catch(function (e) { out.innerHTML = '<p class="warn">XNS resolution failed: ' + e.message + '</p>'; });
  } else if (BTC_ADDR.test(v)) {
    p = Promise.all([
      fetch('https://mempool.space/api/address/' + v + '/txs').then(function (r) {
        if (!r.ok) throw new Error('mempool.space ' + r.status);
        return r.json();
      }),
      fetch('https://mempool.space/api/address/' + v).then(function (r) { return r.json(); })
    ]).then(function (r) {
      var txs = r[0], stats = r[1];
      out.innerHTML = '<h4>Bitcoin address</h4><table>'
        + row('recent txs', txs.length)
        + row('all-time', stats.chain_stats.tx_count + ' txs \u00b7 received '
          + fmtUnits(BigInt(stats.chain_stats.funded_txo_sum), 8) + ' BTC')
        + row('pending', stats.mempool_stats.tx_count + ' txs in mempool') + '</table>'
        + txs.slice(0, 8).map(function (t) {
          return '<p class="mono"><a href="https://mempool.space/tx/' + t.txid
            + '" target="_blank" rel="noopener">' + short(t.txid, 10) + '</a> \u00b7 '
            + (t.status.confirmed ? 'block ' + fmt(t.status.block_height) : 'unconfirmed')
            + ' \u00b7 fee ' + fmt(t.fee) + ' sats</p>';
        }).join('');
    }).catch(function (e) { out.innerHTML = '<p class="warn">lookup failed: ' + e.message + '</p>'; });
  } else {
    out.innerHTML = '<p class="note">Not recognized: try tacit1\u2026, a txid, 0x\u2026, bc1\u2026, or a name like alice@xns.</p>';
  }
  return p;
}
$('lookup-btn').addEventListener('click', doLookup);
$('lookup-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLookup(); });

// ── boot ──
// NB: never name this variable `status` — window.status is a string property, so
// strict mode turns `status.textContent = …` into a TypeError and the whole page
// stays stuck at "loading live data…". Cost two hours once; does not again.
var statusEl = $('statusline');
statusEl.textContent = 'loading live data\u2026';
loadBtcTip();
loadReflection();
loadIndex();
loadQuotes();
loadRpc();
loadKeeperQuote();
loadSnapshot();
loadXnsSample();
function loadXnsSample() {
  // reverse direction is what this registry answers today: getName(address) returns the handle.
  // (forward getAddress(string) returns zero for the names we tried, so we don't pretend otherwise)
  xnsReverse('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045').then(function (name) {
    var el = $('xns-sample');
    if (el && name) el.innerHTML = 'XNS answers on-chain: <code>getName(0xd8dA\u2026a96045)</code> \u2192 <code>'
      + name + '</code> (eth_call to 0x6e79\u202674b during this page load).';
  }).catch(function () {});
}
