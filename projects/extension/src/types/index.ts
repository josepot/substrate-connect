import * as smoldot from '@substrate/smoldot-light';

export type NetworkTypes = 'kusama' | 'polkadot' | 'westend' | 'kulupu'

export type NetworkStatus = 'connected' | 'disconnecting' | 'disconnected';

export interface TabInterface {
    tabId: number | undefined;
    url: string | undefined;
    uApp: uApp;
    isActive?: boolean;
}
export type uApp = {
    networks: string[]; // TODO: for now pass strings in order to make the v0 prototype
    // networks: Network[]; // This should be activated for parachains and v1
    name: string;
    enabled: boolean;
}

export interface Client {
  name: string;
  icon?: string;
  status: NetworkStatus;
}
export interface Network extends Client {
  chain: smoldot.SmoldotChain;
  tabId: number;
  parachains?: Parachain[];
}
export interface Parachain extends Client {
  relaychain: string;
}

export interface NetworkTabProps {
  name: string;
  health: OptionsNetworkTabHealthContent;
  apps: App[];
}

export interface OptionsNetworkTabHealthContent {
  isSyncing?: boolean;
  peers?: number;
  shouldHavePeers?: boolean;
  status: NetworkStatus;
} 
export interface App {
  name: string;
  url?: string;
}

export type NetworkCtx = TabInterface[];
