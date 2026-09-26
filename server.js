import 'dotenv/config';

// ── Validate required env vars before anything else ─────────────────────────
const REQUIRED_ENV = [
  'DB_URI',
  'JWT_SECRET',
  'WALLET_ENCRYPT_KEY',
  'ENCRYPTION_KEY',
];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[STARTUP] FATAL: Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB, corsHandler } from './configs/index.js';
import { initSolanaTrackerProvider } from './providers/solanaTracker.js';
import { initBitqueryProvider } from './providers/bitquery.js';
import { initChainStreamProvider } from './providers/chainstream.js';
import router from './routes/index.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: corsHandler,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'aladdin-node-server', database_backend: 'mongodb' });
});

app.use(authRouter);
app.use(router);

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

initSolanaTrackerProvider({
  baseUrl: process.env.SOLANA_TRACKER_BASE_URL,
  apiKey: process.env.SOLANA_TRACKER_API_KEY,
  timeoutMs: parseInt(process.env.SOLANA_TRACKER_TIMEOUT_MS) || 20000,
});

initBitqueryProvider({
  baseUrl: process.env.BITQUERY_BASE_URL,
  apiKey: process.env.BITQUERY_API_KEY,
});

initChainStreamProvider({
  baseUrl: process.env.CHAINSTREAM_BASE_URL,
  apiKey: process.env.CHAINSTREAM_API_KEY,
  timeoutMs: parseInt(process.env.CHAINSTREAM_TIMEOUT_MS) || 30000,
});

await connectDB(process.env.DB_URI || 'mongodb://localhost:27017/aladdin-db');

app.listen(PORT, () => {
  console.log(`[SERVER] Aladdin Node Server running on port ${PORT}`);
});
