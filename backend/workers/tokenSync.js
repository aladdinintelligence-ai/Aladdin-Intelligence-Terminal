import { syncToken } from '../services/syncToken.js';

const mint = process.argv[2];
if (!mint) {
  console.error('Usage: node workers/tokenSync.js <mint>');
  process.exit(1);
}

const tradeLimit = parseInt(process.argv[3]) || 100;
const holderLimit = parseInt(process.argv[4]) || 100;

async function run() {
  const stats = await syncToken(mint, tradeLimit, holderLimit);
  console.log(JSON.stringify({ status: 'ok', token_mint: mint, stats }, null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
