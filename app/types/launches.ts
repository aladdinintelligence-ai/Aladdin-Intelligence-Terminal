export type LaunchLifecycle = "new" | "almost-bonded" | "migrated";

export interface LaunchParticipantComposition {
  migrationSpecialists: number;
  freshWallets: number;
  scalpers: number;
  unknown: number;
}

export interface LaunchWalletContext {
  sniperShare: number | null;
  bundlerShare: number | null;
  insiderPresent: boolean | null;
  creatorSelling: boolean | null;
}

export interface LaunchToken {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  color: string;
  lifecycle: LaunchLifecycle;
  ageMinutes: number;
  marketCap: number;
  liquidity: number;
  volume: number;
  previousHourVolume: number | null;
  bondingProgress: number | null;
  migratedMinutesAgo: number | null;
  holders: number | null;
  transactions: number | null;
  participants: LaunchParticipantComposition;
  walletContext: LaunchWalletContext;
}

export type LaunchSortKey = "newest" | "market-cap" | "liquidity" | "volume" | "volume-change" | "bonding" | "migration-specialists";

export interface LaunchFilters {
  search: string;
  marketCapMin: number | null;
  marketCapMax: number | null;
  liquidityMin: number | null;
  volumeMin: number | null;
  volumeChangeMin: number | null;
  ageMaxMinutes: number | null;
  lifecycle: LaunchLifecycle[];
  bondingMin: number | null;
  migratedWithinMinutes: number | null;
  migrationSpecialistsMin: number | null;
  scalperShareMax: number | null;
  unknownShareMax: number | null;
  freshWalletsMin: number | null;
  sniperShareMax: number | null;
  bundlerShareMax: number | null;
  insider: "any" | "none" | "present";
  creatorSelling: "any" | "false" | "true";
}
