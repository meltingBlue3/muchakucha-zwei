import { createContext, type RefObject } from 'react';
import type { View } from 'react-native';

export const DialogBackground = createContext<RefObject<View | null> | undefined>(undefined);
