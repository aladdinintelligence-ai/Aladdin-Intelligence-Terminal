import 'dotenv/config';
import { connection, SOL_MINT } from '../services/jupiterService.js';
import { PublicKey } from '@solana/web3.js';

console.log('rpc endpoint:', connection.rpcEndpoint.replace(/alch_\w+/, 'alch_***'));

const slot = await connection.getSlot();
console.log('getSlot ->', slot);

const lamports = await connection.getBalance(new PublicKey(SOL_MINT));
console.log('getBalance(SOL mint) ->', lamports, 'lamports =', (lamports / 1e9).toFixed(2), 'SOL');

const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
console.log('getLatestBlockhash ->', blockhash.slice(0, 16) + '...', 'validHeight', lastValidBlockHeight);
console.log('\nALCHEMY RPC OK');
