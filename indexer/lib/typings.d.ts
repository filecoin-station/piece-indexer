/**
 * Data synced from IPNi
 */
export interface ProviderInfo {
  providerAddress: string;
  lastAdvertisementCID: string;
}

export type ProviderToInfoMap = Map<string, ProviderInfo>;

export interface WalkerState {
  lastHead: string;
  head: string;
  tail: string | undefined
  status: string;
}

export type ProviderToWalkerStateMap = Map<string, WalkerState>

export type PiecePayloadCIDs = string[];

