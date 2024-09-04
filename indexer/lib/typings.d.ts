/**
 * Data extracted from IPNI response
 */
export interface IpniProviderInfo {
  providerId: string;
  providerAddress: string;
  lastAdvertisementCID: string;
}

/**
 * Data stored in our database
 */
export interface ProviderIpniState {
  providerAddress: string;
  lastAdvertisementCID: string;
}

export type ProviderToIpniStateMap = Map<string, ProviderIpniState>;

