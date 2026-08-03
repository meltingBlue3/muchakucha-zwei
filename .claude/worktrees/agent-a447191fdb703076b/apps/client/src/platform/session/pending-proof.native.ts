import * as SecureStore from 'expo-secure-store';

import type { PendingProofStore } from './pending-proof';

const PENDING_PROOF_KEY = 'muchakucha.session.pending-proof.v1';

export const pendingProofStore: PendingProofStore = {
  read: () => SecureStore.getItemAsync(PENDING_PROOF_KEY),
  write: (proof) => SecureStore.setItemAsync(PENDING_PROOF_KEY, proof),
  clear: () => SecureStore.deleteItemAsync(PENDING_PROOF_KEY),
};
