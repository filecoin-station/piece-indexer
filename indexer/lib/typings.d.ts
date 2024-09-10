/**
 * Data synced from IPNI
 */
export interface ProviderInfo {
  providerAddress: string;
  lastAdvertisementCID: string;
}

export type ProviderToInfoMap = Map<string, ProviderInfo>;

/**
lastAdCID --> [ ] -\
               ↓    |
              ...   | entries announced after we started the current walk
               ↓    |
              [ ] -/
               ↓
     head --> [ ] -\
               ↓    |
              ...   | entries visited in this walk
               ↓    |
              [ ] -/
               ↓
     tail --> [ ] -\
               ↓    |
              ...   | entries NOT visited yet
               ↓    |
              [ ] -/
               ↓
last_head --> [ ] -\
               ↓    |
              ...   | entries visited in the previous walks
               ↓    |
              [ ] -/
               ↓
             (null)
 */
export interface WalkerState {
  head: string;
  tail: string | undefined
  lastHead: string;
  status: string;
}

export type ProviderToWalkerStateMap = Map<string, WalkerState>

export type PiecePayloadCIDs = string[];

