# RESULT — Tacit Explorer (bounty poidh base/1519)

## Deliverables

- **URL pública:** https://nicoarias81.github.io/tacit-explorer/ — devuelve `HTTP/1.1 200 OK` y `<title>Tacit Explorer — one page across both chains</title>` [verificado]
- **Repo público:** https://github.com/nicoarias81/tacit-explorer [verificado]
- Página estática (HTML + JS vanilla, sin build, sin dependencias), abierta sin wallet ni login. Read-only: nunca pide seeds/claves, nunca mueve fondos. [verificado — el código no tiene `eth_send*` ni inputs de clave]
- `node --check app.js` OK; http.server local con 200 en index/app.js/style.css/data/* [verificado]

## Endpoints usados, con datos reales de ejemplo

| Endpoint | Dato real capturado en esta sesión | CORS desde browser |
|---|---|---|
| `GET https://api.tacit.finance/reflection/status` | tipHeight 974613, attested 974613, lag 0, bridgeBurns 584, bridgeMinted 561, burnDeposits 127, liveNotes 3749, updatedAt 2026-11-05T08:04:53Z | `Access-Control-Allow-Origin: *` [verificado] |
| `GET https://api.tacit.finance/confidential/index?from=N` (paginado hasta cubrir 14195 entradas) | total 14195, counts leaves 5695 / nullifiers 5850 / wraps 3449 / crossOuts 11, headBlock 26347236, synced true | `*` [verificado] |
| `GET https://api.tacit.finance/confidential/quote?asset=cETH` | cETH assetId 0x3cba71e1…26f34, staticFloor 10000, gasAwareFloor 20712 | `*` [verificado] |
| `GET https://tacit-evm-pool-keeper-base.onrender.com/evm-pool/keeper/quote` | fee/gas/sweepFee del relayer Base (relayer 0x6c19…fEfC) | `*` [verificado] |
| `POST https://mainnet.base.org` | eth_call `nextIndex()` → 173,864 · `root()` · eth_getBalance pool → 4.086094 ETH · eth_blockNumber | origin echoed [verificado] |
| `POST https://ethereum-rpc.publicnode.com` | eth_getBalance ConfidentialPool → 14.9 ETH · eth_blockNumber → 26,347,242 | `*` [verificado] |
| `GET https://mempool.space/api/blocks/tip/height` | 974641 | `*` [verificado] |
| `GET https://api.tacit.finance/assets?network=mainnet` | 81 assets etched | **snapshot**: CORS solo permite orígenes tacit.finance [medido con `curl -sI -H 'Origin: https://nicoarias81.github.io'`] |
| `GET https://api.tacit.finance/amm/pools?network=mainnet` | pools AMM con reservas reales | **snapshot** (mismo motivo) |
| XNSv2 `0x6e797ba2d3103aF167918e71a7E01DE40D45f74b` via publicnode `eth_call` | `getAddress("vitalik@eth")` → 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045; `getName(vitalik)` resuelve reverse | `*` [verificado] |

## Los 3 datos reales más fuertes que muestra la página

1. **ConfidentialPool (Ethereum mainnet): 14,195 tree entries — 5,695 leaves / 5,850 nullifiers / 3,449 wraps**, sincronizado al bloque 26,347,230 contra head 26,347,236. Fuente: `api.tacit.finance/confidential/index`, agregado en vivo por el browser. [medido]
2. **Bridge: 584 burns vs 561 mints ⇒ 23 transfers in flight**, relay tip 974,613 con lag 0 contra el BTC tip (~974,641 al momento de la medición). Fuente: `/reflection/status` + mempool.space, ambas live. [medido]
3. **Base EVM pool ("Secret Sats"): árbol de 173,864 commitments con root leído por eth_call, custodia 4.086 ETH**, pool desplegado en bloque 51,864,014. Fuente: `mainnet.base.org` live + `contracts/deployments/evm-pool.json`. [medido]

## Secciones cubiertas

1. Bitcoin lane (tip mempool.space vs relay tip + lag) · 2. Bridge (burns/mints in flight, burn deposits, burns awaiting bundle, folded cross-outs) · 3. Ethereum ConfidentialPool (counts, wrapped volume por asset sumado sobre todas las entradas wrap, últimos 12 eventos con link a etherscan, fee floors de quote API) · 4. EVM pools (Ethereum/Base/Robinhood/MegaETH con RPC live para Base y ETH) · 5. Assets & AMM snapshot (81 assets, pools con reservas) · 6. Frontera de privacidad (público vs oculto, explícito) · 7. Lookup: tacit1 (decodificado 100% local, bech32m + lanes + derivación bp1…), txid (mempool.space + búsqueda en el índice confidencial ya cargado), 0x address (XNS reverse on-chain + balances ETH/Base), bc1 address, XNS name (getAddress on-chain) · 8. Sources + notas de honestidad.

## Qué quedó afuera / limitaciones honestas

- AMM y assets de Bitcoin: snapshot build-time (2026-11-05) porque esas rutas del indexer envían CORS solo a tacit.finance; no se inventó proxy. Los números coinciden con las respuestas crudas guardadas en `data/`.
- No se muestran montos por nota ni balances de personas: no existen públicamente, y la página lo dice.
- El dominio poidh del bounty no se canjea desde aquí (queda para el usuario con su wallet).

## Evidencia de datos live (comando + salida de esta sesión)

```
$ curl -s https://api.tacit.finance/reflection/status
{"tipHeight":974613,"attestedHeight":974613,"lagBlocks":0,"bridgeBurns":584,
 "bridgeMinted":561,"burnDeposits":127,"liveNotes":3749,
 "updatedAt":"2026-11-05T08:04:53.720Z",...}                       [verificado]

$ curl -s "https://api.tacit.finance/confidential/index?from=0" | jq '.total,.counts,.synced'
14195  {"leaves":5695,"nullifiers":5850,"wraps":3449,"crossOuts":11,...}  true

$ curl -s https://mempool.space/api/blocks/tip/height
974641                                                            [medido]

$ curl -sI -H 'Origin: https://nicoarias81.github.io' https://api.tacit.finance/reflection/status | grep -i access-control
access-control-allow-origin: *                                    [verificado]
```

Respuestas crudas completas en `evidence/` local y resúmenes de verificación JS: decodificador tacit1 probado roundtrip con `node` (encode→decode→checksum-inválido-rechazado→bp1 derivado) [verificado].

## Verificaciones de despliegue

```
$ curl -sI https://nicoarias81.github.io/tacit-explorer/  →  HTTP/1.1 200 OK
$ curl -s https://nicoarias81.github.io/tacit-explorer/ | grep '<title>'
Tacit Explorer — one page across both chains
$ for f in app.js style.css data/assets-mainnet.json data/amm-pools-mainnet.json; do
    curl -s -o /dev/null -w "%{http_code} $f\n" https://nicoarias81.github.io/tacit-explorer/$f; done
200 x4                                                            [verificado]
```

## Pendiente

- [pendiente] Render visual en browser real: el harness de automatización no levantó Chrome (CDP 9222 rechazado). Compensado con `node --check`, pruebas unitarias del codec bech32m/tacit1 en node y curl 200 sobre todos los assets desplegados.
- [pendiente] La tabla de wrapped-volume y "últimos eventos" dependen del paginado completo del índice (~15 requests); si el indexer limita rate en algún momento, el status line informa el progreso.
