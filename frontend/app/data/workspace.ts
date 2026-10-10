import {tokens} from "@/app/data/tokens";
import type {StructuredRow} from "@/app/types/workspace";
export const structuredRows:StructuredRow[]=tokens.map(token=>({token:token.name,symbol:token.symbol,contractAddress:token.mint,marketCap:token.mc,liquidity:token.liquidity,volume:token.volume,holders:token.holders,retention:token.retention,profitableWallets:token.profitable,strength:token.retention>=75?"Early buyers remain positioned":token.profitable>=5?"Profitable wallets involved":"Early discovery",risk:token.top10>35?"High holder concentration":token.liquidity<10000?"Thin liquidity":"Short-term selling pressure"}));
export const tableColumns=["token","symbol","contractAddress","marketCap","liquidity","volume","holders","retention","profitableWallets","strength","risk"] as const;
