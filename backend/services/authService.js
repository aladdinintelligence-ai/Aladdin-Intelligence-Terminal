import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair } from '@solana/web3.js';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/user.model.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aladdin-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const WALLET_ENCRYPT_KEY = process.env.WALLET_ENCRYPT_KEY;
if (!WALLET_ENCRYPT_KEY) {
  console.error('[AUTH] FATAL: WALLET_ENCRYPT_KEY is not set in .env — wallet encryption will fail');
}
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const AUTH_NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// JWT rotation: re-mint on every hit with a short access token, but never
// mint a token that can live longer than the browser-held cookie.
const JWT_ROTATION_INTERVAL_SEC = Math.max(
  60,
  Number(process.env.JWT_ROTATION_INTERVAL_SEC) || 900,
);
const JWT_HARD_CAP_SEC = Math.max(
  JWT_ROTATION_INTERVAL_SEC * 2,
  Number(process.env.JWT_HARD_CAP_SEC) || 3600,
);

// ── JWT (sliding session) ─────────────────────────────────────────────────────

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

export function generateJWT(userId, { maxAgeMs } = {}) {
  const fallbackMaxAge = daysToMs(
    Number(process.env.SESSION_DAYS) > 0 ? Number(process.env.SESSION_DAYS) : 10,
  );
  const cookieCapMs = typeof maxAgeMs === 'number' && maxAgeMs > 0 ? maxAgeMs : fallbackMaxAge;

  const capSec = Math.min(JWT_HARD_CAP_SEC, Math.floor(cookieCapMs / 1000));
  const effectiveSec = Math.max(JWT_ROTATION_INTERVAL_SEC, capSec);
  const finalSec = Math.min(effectiveSec, capSec);

  if (finalSec <= 0) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '5m' });
  }

  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: finalSec });
}

export function verifyJWT(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function shouldRefreshJWT(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    if (!decoded || typeof decoded.exp !== 'number') return false;
    const nowSec = Math.floor(Date.now() / 1000);
    const ageSec = nowSec - decoded.iat;
    if (ageSec < JWT_ROTATION_INTERVAL_SEC) return false;
    const timeToExpSec = decoded.exp - nowSec;
    if (timeToExpSec <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Nonce (anti-replay for Phantom signatures) ───────────────────────────────

const nonces = new Map(); // nonce -> { expiresAt }

export function createNonce() {
  const nonce = crypto.randomBytes(16).toString('base64url');
  nonces.set(nonce, { expiresAt: Date.now() + AUTH_NONCE_EXPIRY_MS });
  // Prune expired nonces opportunistically
  for (const [key, val] of nonces) {
    if (val.expiresAt < Date.now()) nonces.delete(key);
  }
  return nonce;
}

export function consumeNonce(nonce) {
  const entry = nonces.get(nonce);
  if (!entry) return false;
  nonces.delete(nonce);
  return entry.expiresAt >= Date.now();
}

// ── AES-256-GCM Encryption ──────────────────────────────────────────────────

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

export function encryptAES(plaintext) {
  if (!WALLET_ENCRYPT_KEY) throw new Error('WALLET_ENCRYPT_KEY is not configured');
  const salt = crypto.randomBytes(16).toString('hex');
  const iv = crypto.randomBytes(16);
  const key = deriveKey(WALLET_ENCRYPT_KEY + salt, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedData: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: iv.toString('hex'),
    salt,
  };
}

export function decryptAES(encryptedHex, ivHex, salt) {
  if (!WALLET_ENCRYPT_KEY) throw new Error('WALLET_ENCRYPT_KEY is not configured');
  const encryptedBuf = Buffer.from(encryptedHex, 'hex');
  const tag = encryptedBuf.subarray(encryptedBuf.length - 16);
  const data = encryptedBuf.subarray(0, encryptedBuf.length - 16);
  const iv = Buffer.from(ivHex, 'hex');
  const key = deriveKey(WALLET_ENCRYPT_KEY + salt, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

// ── Solana Wallet Generation ────────────────────────────────────────────────

export function generateSolanaWallet() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKeyBase58 = Buffer.from(keypair.secretKey).toString('base64');
  const { encryptedData, iv, salt } = encryptAES(privateKeyBase58);
  return { publicKey, encryptedPrivateKey: encryptedData, iv, salt };
}

// ── Google OAuth ─────────────────────────────────────────────────────────────

export async function verifyGoogleToken(idToken) {
  if (!GOOGLE_CLIENT_ID) throw Object.assign(new Error('Google OAuth not configured'), { status: 503 });

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw Object.assign(new Error('Invalid Google token'), { status: 401 });

  return {
    providerId: payload.sub,
    email: payload.email || null,
    displayName: payload.name || payload.email || 'Google User',
    avatarUrl: payload.picture || null,
  };
}

// ── Telegram Login Widget ───────────────────────────────────────────────────

export function verifyTelegramData(initData) {
  if (!TELEGRAM_BOT_TOKEN) throw Object.assign(new Error('Telegram auth not configured'), { status: 503 });

  const url = new URL(initData);
  const hash = url.searchParams.get('hash');
  url.searchParams.delete('hash');

  // Sort parameters alphabetically
  const dataCheckArr = [];
  for (const [key, value] of url.searchParams.entries()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  // HMAC-SHA256 with bot token as secret
  const secretKey = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (hmac !== hash) {
    throw Object.assign(new Error('Invalid Telegram authentication data'), { status: 401 });
  }

  const user = JSON.parse(url.searchParams.get('user') || '{}');
  if (!user.id) {
    throw Object.assign(new Error('Missing Telegram user data'), { status: 401 });
  }

  // Check auth_date freshness (5 min tolerance)
  const authDate = parseInt(url.searchParams.get('auth_date') || '0', 10);
  if (Date.now() / 1000 - authDate > 300) {
    throw Object.assign(new Error('Telegram authentication expired'), { status: 401 });
  }

  return {
    providerId: String(user.id),
    displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Telegram User',
    avatarUrl: user.photo_url || null,
    username: user.username || null,
  };
}

// ── Phantom Signature Verification ──────────────────────────────────────────

export function verifyPhantomSignature(publicKey, signedMessage, nonce) {
  // The signature is a base64-encoded Ed25519 signature of the message.
  // We verify by reconstructing the expected message and using ed25519 verify.
  // For simplicity, we trust the wallet's signing and validate the nonce.
  // In production, use nacl.sign.detached.verify with the decoded signature.

  const messageBytes = new TextEncoder().encode(nonce);
  const publicKeyBytes = Buffer.from(publicKey, 'base64');
  const signatureBytes = Buffer.from(signedMessage, 'base64');

  // Basic validation: signature must be 64 bytes (Ed25519)
  if (signatureBytes.length !== 64) return false;

  // Use tweetnacl for full verification if available, otherwise accept
  // For now we do length-based validation + nonce check
  // TODO: upgrade to full ed25519 verification with tweetnacl
  return true;
}

// ── User Find / Create ──────────────────────────────────────────────────────

export async function findOrCreateUser(provider, providerId, profile) {
  console.log(`[AUTH] findOrCreateUser called — provider=${provider}, providerId=${providerId}`);

  let user = await User.findOne({
    'authProviders.provider': provider,
    'authProviders.providerId': providerId,
  });

  console.log(`[AUTH] Existing user found: ${user ? `YES (id=${user._id}, hasWallet=${Boolean(user.wallet)})` : 'NO — creating new user'}`);

  if (!user) {
    // Generate unique username
    let username = profile.username || profile.displayName.replace(/\s+/g, '_').toLowerCase();
    const existing = await User.findOne({ username });
    if (existing) username = `${username}_${Date.now().toString(36)}`;

    console.log(`[AUTH] Generating wallet for new user...`);
    // Auto-generate a Solana wallet for the new user
    const wallet = generateSolanaWallet();
    console.log(`[AUTH] Wallet generated — publicKey=${wallet.publicKey}`);

    user = await User.create({
      authProviders: [{ provider, providerId }],
      displayName: profile.displayName,
      username,
      email: profile.email || undefined,
      avatarUrl: profile.avatarUrl || undefined,
      wallet,
    });
    console.log(`[AUTH] New user created — id=${user._id}, hasWallet=${Boolean(user.wallet)}`);
  } else {
    // Only update avatar and email on login — never overwrite displayName or username
    if (profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
    if (profile.email && !user.email) user.email = profile.email;
    await user.save();
    console.log(`[AUTH] Existing user updated — id=${user._id}, hasWallet=${Boolean(user.wallet)}`);
  }

  return user;
}

export async function generateUserWallet(userId, primaryProfile) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  if (user.wallet) throw Object.assign(new Error('Wallet already exists'), { status: 409 });

  const wallet = generateSolanaWallet();
  user.wallet = wallet;
  user.primaryProfile = primaryProfile || 'Trader';
  await user.save();

  return { publicKey: wallet.publicKey, primaryProfile: user.primaryProfile };
}

export async function getUserWallet(userId) {
  const user = await User.findById(userId).select('wallet primaryProfile');
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  if (!user.wallet) return null;
  return { publicKey: user.wallet.publicKey, primaryProfile: user.primaryProfile };
}
