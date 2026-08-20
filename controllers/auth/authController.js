import * as authService from '../../services/authService.js';

// ── Phantom Wallet Auth ─────────────────────────────────────────────────────

export async function phantomLogin(req, res, next) {
  try {
    const { publicKey, signedMessage, nonce } = req.body;
    if (!publicKey || !signedMessage || !nonce) {
      return res.status(400).json({ error: 'publicKey, signedMessage, and nonce are required' });
    }

    if (!authService.consumeNonce(nonce)) {
      return res.status(401).json({ error: 'Invalid or expired nonce' });
    }

    const valid = authService.verifyPhantomSignature(publicKey, signedMessage, nonce);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const user = await authService.findOrCreateUser('phantom', publicKey, {
      displayName: `Phantom_${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`,
    });

    const token = authService.generateJWT(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        primaryProfile: user.primaryProfile,
        hasWallet: Boolean(user.wallet),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Google OAuth ─────────────────────────────────────────────────────────────

export async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const googleProfile = await authService.verifyGoogleToken(idToken);
    const user = await authService.findOrCreateUser('google', googleProfile.providerId, {
      displayName: googleProfile.displayName,
      email: googleProfile.email,
      avatarUrl: googleProfile.avatarUrl,
    });

    const token = authService.generateJWT(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        primaryProfile: user.primaryProfile,
        hasWallet: Boolean(user.wallet),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Telegram Login Widget ───────────────────────────────────────────────────

export async function telegramLogin(req, res, next) {
  try {
    const { initData } = req.body;
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    const tgProfile = authService.verifyTelegramData(initData);
    const user = await authService.findOrCreateUser('telegram', tgProfile.providerId, {
      displayName: tgProfile.displayName,
      avatarUrl: tgProfile.avatarUrl,
      username: tgProfile.username,
    });

    const token = authService.generateJWT(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        primaryProfile: user.primaryProfile,
        hasWallet: Boolean(user.wallet),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Phantom Nonce ────────────────────────────────────────────────────────────

export function getNonce(_req, res) {
  const nonce = authService.createNonce();
  res.json({ nonce });
}

// ── Current User ─────────────────────────────────────────────────────────────

export async function getMe(req, res, next) {
  try {
    const { User } = await import('../../models/user.model.js');
    const user = await User.findById(req.user.userId).select('-wallet -__v');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      primaryProfile: user.primaryProfile,
      hasWallet: Boolean(user.wallet),
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

// ── Wallet Generation ───────────────────────────────────────────────────────

export async function generateWallet(req, res, next) {
  try {
    const { primaryProfile } = req.body;
    const result = await authService.generateUserWallet(req.user.userId, primaryProfile);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ── Get Wallet ───────────────────────────────────────────────────────────────

export async function getWallet(req, res, next) {
  try {
    const wallet = await authService.getUserWallet(req.user.userId);
    if (!wallet) {
      return res.status(404).json({ error: 'No wallet generated yet' });
    }
    res.json(wallet);
  } catch (err) {
    next(err);
  }
}
