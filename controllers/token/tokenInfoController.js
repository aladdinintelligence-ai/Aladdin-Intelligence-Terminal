import axios from 'axios';

const JUPITER_PRICE = 'https://api.jup.ag/price/v2';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

const cache = new Map();
const CACHE_TTL = 30_000;

export async function getTokenInfoController(req, res, next) {
  try {
    const { mint } = req.params;
    if (!mint || mint.length < 32) {
      return res.status(400).json({ error: 'Invalid mint address' });
    }

    const cached = cache.get(mint);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    const [priceRes, dexRes] = await Promise.allSettled([
      axios.get(`${JUPITER_PRICE}?ids=${mint}`, { timeout: 8000 }),
      axios.get(`${DEXSCREENER_API}/${mint}`, { timeout: 8000 }),
    ]);

    const priceData = priceRes.status === 'fulfilled' ? priceRes.value?.data?.data?.[mint] : null;
    const dexPairs = dexRes.status === 'fulfilled' ? dexRes.value?.data?.pairs : null;
    const pair = dexPairs?.[0] || null;

    if (!priceData && !pair) {
      return res.status(404).json({ error: 'Token not found', mint });
    }

    const info = {
      mint,
      symbol: pair?.baseToken?.symbol || priceData?.mint?.slice(0, 6).toUpperCase() || '???',
      name: pair?.baseToken?.name || 'Unknown Token',
      imageUrl: pair?.info?.imageUrl || null,
      priceUsd: priceData?.price != null ? Number(priceData.price) : (pair?.priceUsd != null ? Number(pair.priceUsd) : null),
      marketCapUsd: pair?.marketCap != null ? Number(pair.marketCap) : (pair?.fdv != null ? Number(pair.fdv) : null),
      liquidityUsd: pair?.liquidity?.usd != null ? Number(pair.liquidity.usd) : null,
      volume24h: pair?.volume?.h24 != null ? Number(pair.volume.h24) : null,
      volume6h: pair?.volume?.h6 != null ? Number(pair.volume.h6) : null,
      volume1h: pair?.volume?.h1 != null ? Number(pair.volume.h1) : null,
      priceChange24h: pair?.priceChange?.h24 != null ? Number(pair.priceChange.h24) : null,
      priceChange6h: pair?.priceChange?.h6 != null ? Number(pair.priceChange.h6) : null,
      priceChange1h: pair?.priceChange?.h1 != null ? Number(pair.priceChange.h1) : null,
      txns24h: pair?.txns?.h24 || null,
      pairAddress: pair?.pairAddress || null,
      dexId: pair?.dexId || null,
      pairCreatedAt: pair?.pairCreatedAt || null,
      url: pair?.url || null,
      website: pair?.info?.websites?.[0]?.url || null,
      socials: pair?.info?.socials || [],
    };

    cache.set(mint, { data: info, ts: Date.now() });
    return res.json(info);
  } catch (exc) {
    return next(exc);
  }
}
