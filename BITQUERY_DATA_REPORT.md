# Aladdin Server — Bitquery Data Usage Report

## Overview

This document outlines how the Aladdin Node Server integrates with Bitquery's GraphQL API, detailing the data currently being consumed and the additional data needed to improve the platform.

---

## Current Bitquery Integration

### 1. New Token Discovery (`fetchNewTokens`)

**Query:** `TokenSupplyUpdates` + `DEXPools`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `MintAddress` | TokenSupplyUpdates | Token identifier |
| `Name` | TokenSupplyUpdates | Display name |
| `Symbol` | TokenSupplyUpdates | Ticker symbol |
| `PostBalanceInUSD` | TokenSupplyUpdates | Initial market cap estimate |
| `Block.Time` | TokenSupplyUpdates | Token creation time |
| `Base.PostAmount` | DEXPools | Bonding curve balance |
| `Base.PostAmountInUSD` | DEXPools | Market cap |
| `Quote.PostAmountInUSD` | DEXPools | Liquidity (SOL value) |
| `Quote.PriceInUSD` | DEXPools | Token price |
| `Market.MarketAddress` | DEXPools | Pool address |

**Filter:** Pump.fun program (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`)

---

### 2. Almost-Bonded Tokens (`fetchAlmostBondedTokens`)

**Query:** `DEXPools` + `DEXTradeByTokens`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `MintAddress` | DEXPools | Token identifier |
| `Name`, `Symbol` | DEXPools | Token metadata |
| `Base.PostAmount` | DEXPools | Bonding progress calculation |
| `Base.PostAmountInUSD` | DEXPools | Market cap |
| `Quote.PostAmountInUSD` | DEXPools | Liquidity |
| `Quote.PriceInUSD` | DEXPools | Current price |
| `VolumeInUSD` | DEXTradeByTokens | 24h trade volume |
| `Block.Time` | DEXTradeByTokens | First trade time (age calculation) |

**Filter:** Base amount between 206,900,000 and 246,555,000 (approaching bonding curve completion)

---

### 3. Migrated Tokens (`fetchMigratedTokens`)

**Query:** `DEXPools` + `BalanceUpdates` + `DEXTradeByTokens`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `MintAddress` | DEXPools | Token identifier |
| `Name`, `Symbol` | DEXPools | Token metadata |
| `Block.Time` | DEXPools | Migration timestamp |
| `Base.PostAmountInUSD` | DEXPools | Market cap |
| `Quote.PostAmountInUSD` | DEXPools | Liquidity |
| Holder count | BalanceUpdates | Unique holder count |
| Transaction count | DEXTradeByTokens | Total trade count |

**Filter:** Pump AMM protocol (`pump_amm`)

---

### 4. Trending Tokens (`fetchTrendingTokens`)

**Query:** `DEXTradeByTokens` + `DEXPools` + `DEXTradeByTokens` (first trade)

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `VolumeInUSD` | DEXTradeByTokens | 24h aggregated volume |
| `MintAddress`, `Name`, `Symbol` | DEXTradeByTokens | Token metadata |
| `PriceInUSD` | DEXTradeByTokens | Current price |
| `Base.PostAmountInUSD` | DEXPools | Market cap |
| `Quote.PostAmountInUSD` | DEXPools | Liquidity |
| `Block.Time` | DEXTradeByTokens | First trade time |

**Filter:** Tokens ending with "pump" (Pump.fun tokens), sorted by volume

---

### 5. OHLC Candle Data (`fetchTokenOHLC`)

**Query:** `DEXTradeByTokens`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `Block.Timefield` | DEXTradeByTokens | Candle timestamp (5min intervals) |
| `Trade_Side_AmountInUSD` (sum) | DEXTradeByTokens | Candle volume |
| `Trade_PriceInUSD` (quantile 0.5) | DEXTradeByTokens | Open/Close price |
| `Trade_PriceInUSD` (quantile 0.95) | DEXTradeByTokens | High price |
| `Trade_PriceInUSD` (quantile 0.05) | DEXTradeByTokens | Low price |
| `count` | DEXTradeByTokens | Number of trades |

---

### 6. Token Details (`fetchTokenDetails`)

**Query:** `DEXPools` + `DEXTradeByTokens`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `Base.PostAmount` | DEXPools | Bonding curve balance |
| `Base.PostAmountInUSD` | DEXPools | Market cap |
| `Quote.PostAmountInUSD` | DEXPools | Liquidity |
| `Quote.PriceInUSD` | DEXPools | Current price |
| `Trade.PriceInUSD` | DEXTradeByTokens | Latest trade price |

---

### 7. Movers Page (`fetchMovers`)

**Query:** `DEXTradeByTokens` + `DEXTradeByTokens` (buyer counts)

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `VolumeInUSD` | DEXTradeByTokens | 24h volume per token |
| `MintAddress`, `Name`, `Symbol` | DEXTradeByTokens | Token metadata |
| Distinct buyer wallets | DEXTradeByTokens | Buyer count (behavioural metric) |

**Filter:** Tokens ending with "pump", excludes major tokens (SOL, USDC, USDT)

---

### 8. Token Trades (`fetchTrades`)

**Query:** `DEXTradeByTokens`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `Block.Time` | DEXTradeByTokens | Trade timestamp |
| `Trade.Side.Type` | DEXTradeByTokens | Buy/Sell direction |
| `Trade.Amount` | DEXTradeByTokens | Trade size |
| `Trade.PriceInUSD` | DEXTradeByTokens | Trade price |
| `Trade.Account.Address` | DEXTradeByTokens | Wallet address |
| `Transaction.Signature` | DEXTradeByTokens | Transaction hash |

---

### 9. Token Participants (`fetchParticipants`)

**Query:** `DEXTradeByTokens`

**Data Consumed:**
- Aggregated wallet-level trading activity
- Buy/sell counts per wallet
- Total volume per wallet
- First/last trade timestamps

---

### 10. Token Holders (`fetchHolders`)

**Query:** `BalanceUpdates`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| `Account.Address` | BalanceUpdates | Holder wallet |
| `PostBalance` | BalanceUpdates | Current token balance |

**Processing:** Deduplicates to latest balance per wallet, filters positive balances

---

### 11. First Buyers (`fetchFirstBuyers`)

**Query:** `DEXTradeByTokens`

**Data Consumed:**
- First 100 unique buyers (by trade time ascending)
- Entry price and timing for each buyer

---

### 12. Token Stats (`fetchTokenStats`)

**Query:** `DEXTradeByTokens` + `BalanceUpdates`

**Data Consumed:**
| Field | Source | Purpose |
|-------|--------|---------|
| Trade count (24h) | DEXTradeByTokens | Activity metric |
| Volume (24h) | DEXTradeByTokens | Volume metric |
| Buy/Sell volume (24h) | DEXTradeByTokens | Buy pressure metric |
| Trade count (1h) | DEXTradeByTokens | Recent activity |
| Volume (1h) | DEXTradeByTokens | Recent volume |
| Holder count | BalanceUpdates | Holder metric |
| Top-10 concentration | BalanceUpdates | Whale concentration |

---

## Data Currently NOT Available from Bitquery

The following data is currently fetched from alternative sources (DexScreener, Jupiter) or computed on the server. Access to this data from Bitquery would simplify our architecture and improve data consistency.

### 1. Token Images / Logos

**Current Source:** DexScreener API (`pair.info.imageUrl`)

**Need:** Token image URLs for display in token lists, cards, and navigation.

**Impact:** High — Currently requires a separate DexScreener API call for every page that displays tokens.

---

### 2. Price Change Percentages (1h, 6h, 24h)

**Current Source:** DexScreener API (`pair.priceChange.h1/h6/h24`)

**Need:** Pre-calculated price change percentages for sorting and display.

**Impact:** High — Used on Movers page, Live page, and token cards. Currently requires DexScreener enrichment.

---

### 3. Token Social Links & Website

**Current Source:** DexScreener API (`pair.info.socials`, `pair.info.websites`)

**Need:** Twitter, Telegram, Discord, website URLs for token detail pages.

**Impact:** Medium — Used on Live page and Ask Aladdin context.

---

### 4. Wallet Behaviour Classification

**Current Source:** Computed on server (`tokensController.js`)

**Need:** Pre-classified wallet behaviours (Migration Specialist, Scalper, Fresh Wallet, etc.) based on trading patterns.

**Impact:** Medium — Currently computed from raw trade data. Bitquery could provide aggregations for:
- Trade frequency patterns
- Holding duration
- Win rate
- Entry timing relative to migration

---

### 5. Formation State Classification

**Current Source:** Computed on server (`moversController.js`)

**Need:** Pre-classified token formation states (Discovery, Early Accumulation, Broad Accumulation, etc.)

**Impact:** Medium — Currently derived from market cap, liquidity, volume, and buyer count thresholds.

---

### 6. Historical Pair Data

**Current Source:** Not available

**Need:** Historical DEX pool data for backtesting formation patterns and historical matching.

**Impact:** Low-Medium — Would enable the "Historical Match" feature to work with real historical data.

---

### 7. Batch Token Metadata

**Current Source:** Individual lookups or DexScreener batch

**Need:** Efficient batch endpoint for token metadata (name, symbol, image) without trade/pool data overhead.

**Impact:** Medium — Currently requires either:
- Multiple individual Bitquery queries
- DexScreener API calls (separate from Bitquery)

---

### 8. Creator Wallet Identification

**Current Source:** Not available from Bitquery

**Need:** Token creator wallet address for insider/creator activity analysis.

**Impact:** Medium — Used for "Insider / Creator Activity" page.

---

### 9. Bundle Detection

**Current Source:** Not available from Bitquery

**Need:** Identification of bundled buys (multiple wallets buying同一个token in the same block/transaction).

**Impact:** Low-Medium — Would improve sniper/bundler detection accuracy.

---

### 10. Real-time Trade Streaming

**Current Source:** Polling (15-120 second intervals)

**Need:** WebSocket or subscription-based real-time trade updates.

**Impact:** Low — Current polling is sufficient, but real-time would improve live terminal experience.

---

## Summary of Current Data Sources

| Data Type | Current Source | Bitquery Available? |
|-----------|---------------|-------------------|
| Token discovery (new/migrated) | Bitquery | Yes |
| Pool data (MC, liquidity) | Bitquery | Yes |
| Trade volume | Bitquery | Yes |
| Holder counts | Bitquery | Yes |
| OHLC candles | Bitquery | Yes |
| Token images | DexScreener | **No** |
| Price change % | DexScreener | **No** |
| Social links | DexScreener | **No** |
| Wallet classification | Server-computed | **No** |
| Formation states | Server-computed | **No** |

---

## Recommendations

1. **Token Images:** If Bitquery can provide token image URLs (from on-chain metadata or off-chain indexers), we can eliminate DexScreener dependency for image display.

2. **Price Change Aggregations:** Pre-calculated 1h/6h/24h price changes would reduce the need for DexScreener enrichment on the Movers page.

3. **Batch Metadata Endpoint:** A lightweight batch endpoint for token metadata (name, symbol, image) without trade/pool overhead would improve performance.

4. **Creator Wallet Data:** Access to token creator wallet addresses would enable insider activity analysis without additional on-chain queries.

5. **Wallet Behaviour Indicators:** Pre-computed wallet-level metrics (holding duration, trade frequency, win rate) would simplify smart money detection.

---

*Report generated: August 2026*
*Aladdin Server Version: Current production*
*Bitquery Integration: GraphQL API via streaming.bitquery.io*
