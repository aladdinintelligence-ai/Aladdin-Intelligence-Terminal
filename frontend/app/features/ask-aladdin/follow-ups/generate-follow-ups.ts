export function generateFollowUps(question:string,entityId?:string){
 const symbol=!entityId?"this token":/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(entityId)?"this token":entityId;
 if(/^[1-9A-HJ-NP-Za-km-z]{32,}$/i.test(question.trim()))return[`Why is ${symbol}'s formation classified this way?`,`Show ${symbol}'s historical matches.`,`How many holders entered in the first 5 minutes?`,`Are profitable wallets still holding ${symbol}?`];
 if(/how many.*(5\s*(min|minute))|first\s*5\s*(min|minute)/i.test(question))return[`Who were ${symbol}'s early holders?`,`When did they enter ${symbol}?`,`Are early holders distributing ${symbol}?`,`How concentrated are ${symbol}'s early holders?`];
 if(/migration specialist|wallets.*holding/i.test(question))return["Show their previous profitable tokens.",`Which wallet holds the most ${symbol}?`,"When did these wallets start reducing?",`Compare these wallets with ${symbol}'s Scalpers.`];
 if(/compare|differently|frog/i.test(question))return[`Which early ${symbol} wallets are still holding?`,"Show the liquidity changes by lifecycle stage.","Compare creator-linked selling."];
 if(/woke up|today|while i was away/i.test(question))return["Which tokens retained the most early buyers?","Show profitable wallets that entered today.","Which migrations lost liquidity fastest?"];
 return[`Which Migration Specialists are still holding ${symbol}?`,`Show ${symbol}'s early-buyer retention.`];
}