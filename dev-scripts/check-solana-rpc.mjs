import 'dotenv/config';
import { connection, SOL_MINT } from '../services/jupiterService.js';
import { PublicKey } from '@solana/web3.js';

// Helius keys are UUIDs, so mask that shape rather than an Alchemy key prefix.
console.log('rpc endpoint:', connection.rpcEndpoint.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, '***'));
console.log('ws endpoint :', process.env.SOLANA_WS_URL ? 'configured' : 'not configured');

const slot = await connection.getSlot();
console.log('getSlot ->', slot);

const lamports = await connection.getBalance(new PublicKey(SOL_MINT));
console.log('getBalance(SOL mint) ->', lamports, 'lamports =', (lamports / 1e9).toFixed(2), 'SOL');

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
console.log('getLatestBlockhash ->', blockhash.slice(0, 16) + '...', 'validHeight', lastValidBlockHeight);
console.log('\nHELIUS RPC OK');