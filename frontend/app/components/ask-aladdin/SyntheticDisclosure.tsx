export const SYNTHETIC_DISCLOSURE="Synthetic demo data — not live or historical Solana activity.";
export function SyntheticDisclosure({compact=false}:{compact?:boolean}){return <div className={compact?"syntheticDisclosure compact":"syntheticDisclosure"} role="note">{SYNTHETIC_DISCLOSURE}</div>}
