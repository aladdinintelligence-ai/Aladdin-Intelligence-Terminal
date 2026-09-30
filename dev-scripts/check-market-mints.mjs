import fs from 'node:fs';
import {Connection,PublicKey,LAMPORTS_PER_SOL} from '@solana/web3.js';

const key=process.env.ALCHEMY_API_KEY;
const connection=new Connection(`https://solana-mainnet.g.alchemy.com/v2/${key}`,'confirmed');
const manifest=JSON.parse(fs.readFileSync('app/data/devnet-market-manifest.json','utf8'));
const mints=Object.values(manifest).map(v=>v.mint);

console.log('manifest markets:',mints.length,'\n');
for(const mint of mints.slice(0,6)){
  const info=await connection.getAccountInfo(new PublicKey(mint));
  if(!info){console.log(`${mint.slice(0,10)}... NOT FOUND on mainnet`);continue}
  const parsed=info.data.length>=82?null:null;
  const supply=await connection.getTokenSupply(new PublicKey(mint)).catch(()=>null);
  console.log(`${mint.slice(0,10)}... exists=YES owner=${info.owner.toBase58().slice(0,12)}.. mintAuth=${info.mintAuthority?'SET (mintable)':'none'} supply=${supply?.value?.uiAmountString??'?'} lamports=${info.lamports} (${(info.lamports/LAMPORTS_PER_SOL).toFixed(2)} SOL)`);
}
