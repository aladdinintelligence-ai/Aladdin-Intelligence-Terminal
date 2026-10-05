import dotenv from 'dotenv';

dotenv.config();

const defaultWhitelist = [
  "https://aladdinterminal.xyz",
  "https://www.aladdinterminal.xyz",
  process.env.FRONTEND_LOCAL,
  process.env.FRONTEND_PROD,
].filter(Boolean);

// CORS_ORIGINS allows extra browser origins (comma separated). Without it a
// production frontend on any other domain is rejected by corsHandler, and the
// browser then drops the auth cookie even when Set-Cookie itself was valid.
const configured = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const whitelist = [...new Set([...defaultWhitelist, ...configured])];

export function corsHandler(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }
  if (whitelist.includes(origin)) {
    return callback(null, true);
  }
  console.warn(`[cors] rejected origin: ${origin}`);
  return callback(new Error("Not allowed by CORS"));
}

export { whitelist as corsWhitelist };