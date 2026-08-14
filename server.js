import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './configs/index.js';
import { initSolanaTrackerProvider } from './providers/solanaTracker.js';
import router from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim()),
  credentials: true,
}));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'aladdin-node-server', database_backend: 'mongodb' });
});

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

await connectDB(process.env.DB_URI || 'mongodb://localhost:27017/aladdin-db');

app.listen(PORT, () => {
  console.log(`[SERVER] Aladdin Node Server running on port ${PORT}`);
});
