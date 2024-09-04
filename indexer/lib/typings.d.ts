export interface ProviderIndexingState {
  providerAddress: string;
  lastHead: string;
  nextHead: string;
  head: string;
  tail: string;
  status: string;
}

export type PiecePayloadCIDs = string[];

// Mapping providerIds to the indexing state
export type ProvidersWithState = Map<string, ProviderIndexingState>

export interface Repository {
  getProvidersWithState(): Promise<ProvidersWithState>;
  updateProvidersWithState(updates: ProvidersWithState): Promise<void>;

  // addPiecePayloadCID(provider: string, pieceCid: string, payloadCid: string): Promise<void>;
  // getPiecePayloadCIDs(provider: string, pieceCid: string): Promise<PiecePayloadCIDs | undefined>;
}

export interface IpniProviderInfo {
  providerId: string;
  providerAddress: string;
  lastAdvertisementCID: string;
}

