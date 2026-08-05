import { ApiClient } from '@muchakucha/api-client';
import { Platform } from 'react-native';

import { createSessionStateStore } from './session-state';
import { createNativeSessionTransport } from '../../platform/session/session-transport.native';
import { createWebSessionTransport } from '../../platform/session/session-transport.web';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

export const sessionApiClient = new ApiClient(apiOrigin);
export const sessionStateStore = createSessionStateStore();
export const sessionTransport =
  Platform.OS === 'web'
    ? createWebSessionTransport(sessionApiClient)
    : createNativeSessionTransport(sessionApiClient);
