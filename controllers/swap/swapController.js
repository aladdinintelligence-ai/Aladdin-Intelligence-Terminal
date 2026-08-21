import { PublicKey } from '@solana/web3.js';
import { User } from '../../models/user.model.js';
import { Trade } from '../../models/trade.model.js';
import * as jupiterService from '../../services/jupiterService.js';



// ── Get Quote ───────────────────────────────────────────────────────────────
export async function getQuoteController(req, res, next) {
  try {
    const { inputMint, outputMint, amount, slippageBps } = req.body;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ error: 'inputMint, outputMint, and amount are required' });
    }

    const quote = await jupiterService.getQuote({
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: slippageBps || 50,
    });

    res.json(quote);
  } catch (err) {
    next(err);
  }
}

// ── Execute Swap ────────────────────────────────────────────────────────────
export async function swapController(req, res, next) {
  try {
    const { inputMint, outputMint, amount, slippageBps } = req.body;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ error: 'inputMint, outputMint, and amount are required' });
    }

    const result = await jupiterService.executeSwap({
      userId: req.user.userId,
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: slippageBps || 50,
    });

    // Store trade in DB
    try {
      const user = await User.findById(req.user.userId).select('wallet');
      if (user?.wallet) {
        const inputPrice = await jupiterService.getTokenPrice(inputMint);
        const outputPrice = await jupiterService.getTokenPrice(outputMint);

        const inAmountNum = Number(result.inAmount);
        const outAmountNum = Number(result.outAmount);

        // Calculate SOL amount and USD amount based on direction
        let solAmount = 0;
        let usdAmount = 0;
        let tokenAmount = 0;
        let tokenMint = outputMint;
        let side = 'buy';

        if (inputMint === jupiterService.SOL_MINT) {
          // Buying token with SOL
          solAmount = inAmountNum / 1e9;
          tokenAmount = outAmountNum / Math.pow(10, outputMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 6 : 9);
          usdAmount = inputPrice ? solAmount * inputPrice : 0;
          tokenMint = outputMint;
          side = 'buy';
        } else if (outputMint === jupiterService.SOL_MINT) {
          // Selling token for SOL
          solAmount = outAmountNum / 1e9;
          tokenAmount = inAmountNum / Math.pow(10, inputMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 6 : 9);
          usdAmount = outputPrice ? solAmount * outputPrice : 0;
          tokenMint = inputMint;
          side = 'sell';
        } else {
          // Token-to-token swap
          tokenAmount = inAmountNum / 1e9;
          solAmount = 0;
          usdAmount = 0;
          tokenMint = inputMint;
          side = 'buy';
        }

        await Trade.create({
          tokenMint,
          walletAddress: user.wallet.publicKey,
          transactionSignature: result.signature,
          side,
          blockTime: new Date(),
          solAmount,
          usdAmount,
          tokenAmount,
          priceUsd: outputPrice || null,
          provider: 'jupiter',
          qualityStatus: 'confirmed',
          providerPayload: {
            quote: result.quote,
            routePlan: result.routePlan,
            priceImpactPct: result.priceImpactPct,
          },
        });
      }
    } catch (dbErr) {
      // Don't fail the swap response if DB write fails
      console.error('Failed to store trade:', dbErr.message);
    }

    res.json({
      signature: result.signature,
      inputMint: result.inputMint,
      outputMint: result.outputMint,
      inAmount: result.inAmount,
      outAmount: result.outAmount,
      priceImpactPct: result.priceImpactPct,
      explorerUrl: `https://explorer.solana.com/tx/${result.signature}`,
    });
  } catch (err) {
    next(err);
  }
}

// ── Get Wallet Balance ──────────────────────────────────────────────────────
export async function getBalanceController(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select('wallet');
    if (!user || !user.wallet) {
      return res.status(404).json({ error: 'No wallet found' });
    }

    const publicKey = new PublicKey(user.wallet.publicKey);

    const [solBalance, tokenBalances] = await Promise.all([
      jupiterService.getSolBalance(publicKey).catch(() => 0),
      jupiterService.getTokenBalances(publicKey).catch(() => []),
    ]);

    res.json({
      publicKey: user.wallet.publicKey,
      solBalance,
      tokens: tokenBalances,
    });
  } catch (err) {
    next(err);
  }
}

// ── Get Transaction History ─────────────────────────────────────────────────
export async function getTradeHistoryController(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select('wallet');
    if (!user || !user.wallet) {
      return res.status(404).json({ error: 'No wallet found' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const trades = await Trade.find({ walletAddress: user.wallet.publicKey })
      .sort({ blockTime: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Trade.countDocuments({ walletAddress: user.wallet.publicKey });

    res.json({ trades, total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// ── Token Price ─────────────────────────────────────────────────────────────
export async function getPriceController(req, res, next) {
  try {
    const { mint } = req.params;
    if (!mint) {
      return res.status(400).json({ error: 'mint is required' });
    }

    const price = await jupiterService.getTokenPrice(mint);
    res.json({ mint, price });
  } catch (err) {
    next(err);
  }
}
