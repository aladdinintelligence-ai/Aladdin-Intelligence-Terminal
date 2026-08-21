import * as authService from '../../services/authService.js';

function userResponse(user) {
  return {
    id: user._id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    primaryProfile: user.primaryProfile,
    authProvider: user.authProviders?.[0]?.provider || null,
    walletAddress: user.wallet?.publicKey || null,
    hasWallet: Boolean(user.wallet),
  };
}

// ── Phantom Wallet Auth ─────────────────────────────────────────────────────

export async function phantomLogin(req, res, next) {
  try {
    const { publicKey, signedMessage, nonce } = req.body;
    console.log(`[AUTH:phantom] Login attempt — publicKey=${publicKey?.slice(0, 8)}...`);
    if (!publicKey || !signedMessage || !nonce) {
      console.log(`[AUTH:phantom] Missing fields — publicKey=${Boolean(publicKey)}, signedMessage=${Boolean(signedMessage)}, nonce=${Boolean(nonce)}`);
      return res.status(400).json({ error: 'publicKey, signedMessage, and nonce are required' });
    }

    if (!authService.consumeNonce(nonce)) {
      console.log(`[AUTH:phantom] Nonce invalid or expired`);
      return res.status(401).json({ error: 'Invalid or expired nonce' });
    }

    const valid = authService.verifyPhantomSignature(publicKey, signedMessage, nonce);
    if (!valid) {
      console.log(`[AUTH:phantom] Signature verification failed`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log(`[AUTH:phantom] Finding or creating user...`);
    const user = await authService.findOrCreateUser('phantom', publicKey, {
      displayName: `Phantom_${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`,
    });

    const token = authService.generateJWT(user._id);
    console.log(`[AUTH:phantom] Success — userId=${user._id}, hasWallet=${Boolean(user.wallet)}, walletPubkey=${user.wallet?.publicKey || 'NONE'}`);
    res.json({ token, user: userResponse(user) });
  } catch (err) {
    console.error(`[AUTH:phantom] Error:`, err.message);
    next(err);
  }
}

// ── Google OAuth ─────────────────────────────────────────────────────────────

export async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;
    console.log(`[AUTH:google] Login attempt — idToken=${idToken ? 'present' : 'MISSING'}`);
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const googleProfile = await authService.verifyGoogleToken(idToken);
    console.log(`[AUTH:google] Google profile verified — providerId=${googleProfile.providerId}`);
    const user = await authService.findOrCreateUser('google', googleProfile.providerId, {
      displayName: googleProfile.displayName,
      email: googleProfile.email,
      avatarUrl: googleProfile.avatarUrl,
    });

    const token = authService.generateJWT(user._id);
    console.log(`[AUTH:google] Success — userId=${user._id}, hasWallet=${Boolean(user.wallet)}, walletPubkey=${user.wallet?.publicKey || 'NONE'}`);
    res.json({ token, user: userResponse(user) });
  } catch (err) {
    console.error(`[AUTH:google] Error:`, err.message);
    next(err);
  }
}

// ── Telegram Login Widget ───────────────────────────────────────────────────

export async function telegramLogin(req, res, next) {
  try {
    const { initData } = req.body;
    console.log(`[AUTH:telegram] Login attempt — initData=${initData ? 'present' : 'MISSING'}`);
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    const tgProfile = authService.verifyTelegramData(initData);
    console.log(`[AUTH:telegram] Telegram profile verified — providerId=${tgProfile.providerId}`);
    const user = await authService.findOrCreateUser('telegram', tgProfile.providerId, {
      displayName: tgProfile.displayName,
      avatarUrl: tgProfile.avatarUrl,
      username: tgProfile.username,
    });

    const token = authService.generateJWT(user._id);
    console.log(`[AUTH:telegram] Success — userId=${user._id}, hasWallet=${Boolean(user.wallet)}, walletPubkey=${user.wallet?.publicKey || 'NONE'}`);
    res.json({ token, user: userResponse(user) });
  } catch (err) {
    console.error(`[AUTH:telegram] Error:`, err.message);
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
    console.log(`[AUTH:me] Fetching user — userId=${req.user.userId}`);
    const user = await User.findById(req.user.userId).select('-__v');
    if (!user) {
      console.log(`[AUTH:me] User not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    const authProvider = user.authProviders?.[0]?.provider || null;
    console.log(`[AUTH:me] Found — displayName=${user.displayName}, hasWallet=${Boolean(user.wallet)}, walletPubkey=${user.wallet?.publicKey || 'NONE'}`);
    res.json({
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      primaryProfile: user.primaryProfile,
      authProvider,
      walletAddress: user.wallet?.publicKey || null,
      hasWallet: Boolean(user.wallet),
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

// ── Update Profile ──────────────────────────────────────────────────────────

export async function updateMe(req, res, next) {
  try {
    const { User } = await import('../../models/user.model.js');
    const { displayName, username, primaryProfile } = req.body;

    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (username !== undefined) update.username = username;
    if (primaryProfile !== undefined) update.primaryProfile = primaryProfile;

    // Check username uniqueness if changing
    if (username) {
      const existing = await User.findOne({ username, _id: { $ne: req.user.userId } });
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const authProvider = user.authProviders?.[0]?.provider || null;
    res.json({
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      primaryProfile: user.primaryProfile,
      authProvider,
      walletAddress: user.wallet?.publicKey || null,
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
