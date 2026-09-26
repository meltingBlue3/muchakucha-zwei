import { createDraftStorage } from '../platform/drafts/draft-storage';
import { createWorkspaceState } from './workspace-store';

export const draftWorkspace = createWorkspaceState(createDraftStorage());
