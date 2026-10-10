export type MaybeNumber = number | null | undefined;

export const money=(v:MaybeNumber):string=>{
  if(v==null||!Number.isFinite(v))return "—";
  return v>=1e6?`$${(v/1e6).toFixed(2)}M`:v>=1e3?`$${(v/1e3).toFixed(v<1e4?1:0)}K`:`$${v}`;
};

export const pct=(v:MaybeNumber):string=>{
  if(v==null||!Number.isFinite(v))return "—";
  return `${v>0?"+":""}${v.toFixed(1)}%`;
};
