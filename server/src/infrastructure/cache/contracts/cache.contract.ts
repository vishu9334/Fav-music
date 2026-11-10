/**
 * Cache & Transient Distributed State Contract
 */
export interface ICacheService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  ping(): Promise<string>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

