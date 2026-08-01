export interface PendingProofStore {
  read(): Promise<string | null>;
  write(proof: string): Promise<void>;
  clear(): Promise<void>;
}

export interface WebPendingProofTransport {
  readonly credentials: 'include';
}
