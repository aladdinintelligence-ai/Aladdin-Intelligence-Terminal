import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { User } from '../models/user.model.js';
import { decryptAES } from './authService.js';

const JUPITER_API = process.env.JUPITER_API_URL || 'https://api.jup.ag/swap/v1';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
// Helius is the only Solana RPC backend for this service. No Alchemy and no
// public-endpoint fallback: a silent fallback would hide a missing key.
const HELIUS_SOLANA_RPC = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : '';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || HELIUS_SOLANA_RPC;
const SOLANA_WS = process.env.SOLANA_WS_URL || '';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
if (!SOLANA_RPC) {
  throw new Error(
    'Solana RPC is not configured. Set HELIUS_API_KEY (or SOLANA_RPC_URL) before starting the server.',
  );
}
const connection = new Connection(SOLANA_RPC, {
  commitment: 'confirmed',
  ...(SOLANA_WS ? { wsEndpoint: SOLANA_WS } : {}),
});

// ── Known stablecoin / common token mints ───────────────────────────────────
const KNOWN_MINTS = {
  SOL: SOL_MINT,
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  MSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  BSOL: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
  Jito: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
};

export function isKnownMint(mint) {
  return Object.values(KNOWN_MINTS).includes(mint);
}

// ── Get user's decrypted keypair ────────────────────────────────────────────
async function getUserKeypair(userId) {
  const user = await User.findById(userId).select('wallet');
  if (!user || !user.wallet) {
    throw Object.assign(new Error('No wallet found. Generate a wallet first.'), { status: 404 });
  }

  const privateKeyBase58 = decryptAES(
    user.wallet.encryptedPrivateKey,
    user.wallet.iv,
    user.wallet.salt
  );
  const secretKey = Uint8Array.from(Buffer.from(privateKeyBase58, 'base64'));
  return Keypair.fromSecretKey(secretKey);
}

// ── Get SOL balance ─────────────────────────────────────────────────────────
export async function getSolBalance(publicKey) {
  const lamports = await connection.getBalance(publicKey);
  return lamports / 1e9;
}

// ── Get SPL token balances ──────────────────────────────────────────────────
export async function getTokenBalances(publicKey) {
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );

  return tokenAccounts.value.map((ta) => ({
    mint: ta.account.data.parsed.info.mint,
    amount: ta.account.data.parsed.info.tokenAmount.uiAmount || 0,
    decimals: ta.account.data.parsed.info.tokenAmount.decimals,
    uiAmountString: ta.account.data.parsed.info.tokenAmount.uiAmountString,
  })).filter((t) => t.amount > 0);
}

// ── Jupiter Quote ───────────────────────────────────────────────────────────
export async function getQuote({ inputMint, outputMint, amount, slippageBps = 50 }) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: String(slippageBps),
    swapMode: 'ExactIn',
  });

  console.log(`[JUPITER] Quote request — input=${inputMint}, output=${outputMint}, amount=${amount}, slippage=${slippageBps}`);
  const res = await fetch(`${JUPITER_API}/quote?${params}`);
  if (!res.ok) {
    const err = await res.text();
    console.error(`[JUPITER] Quote failed (${res.status}): ${err}`);
    throw Object.assign(new Error(`Jupiter quote failed: ${err}`), { status: 502 });
  }
  const data = await res.json();
  console.log(`[JUPITER] Quote OK — outAmount=${data.outAmount}, route=${data.routePlan?.map(r => r.swapInfo.label).join(' → ')}`);
  return data;
}

// ── Jupiter Swap Transaction ────────────────────────────────────────────────
export async function getSwapTransaction(quoteResponse, userPublicKey) {
  const res = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw Object.assign(new Error(`Jupiter swap failed: ${err}`), { status: 502 });
  }
  return res.json();
}

// ── Execute Swap (full flow) ────────────────────────────────────────────────
export async function executeSwap({ userId, inputMint, outputMint, amount, slippageBps }) {
  const keypair = await getUserKeypair(userId);
  const userPublicKey = keypair.publicKey.toBase58();

  // 1. Get quote
  const quote = await getQuote({ inputMint, outputMint, amount, slippageBps });

  // 2. Get swap transaction
  const { swapTransaction } = await getSwapTransaction(quote, userPublicKey);

  // 3. Deserialize, sign, send
  const swapTxBuf = Buffer.from(swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTxBuf);
  transaction.sign([keypair]);

  const rawTx = transaction.serialize();
  const txid = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  // 4. Confirm
  const latestBlockhash = await connection.getLatestBlockhash();
  const confirmation = await connection.confirmTransaction(
    {
      signature: txid,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  if (confirmation.value.err) {
    throw Object.assign(new Error('Transaction failed on-chain'), { status: 500 });
  }

  return {
    signature: txid,
    quote,
    inputMint,
    outputMint,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    priceImpactPct: quote.priceImpactPct,
    routePlan: quote.routePlan,
  };
}

// ── Token Price (USD) via Jupiter Price API ─────────────────────────────────
export async function getTokenPrice(mint) {
  try {
    const res = await fetch(`${JUPITER_API}/price/v2?ids=${mint}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[mint]?.price ?? null;
  } catch {
    return null;
  }
}

export { SOL_MINT, connection };
