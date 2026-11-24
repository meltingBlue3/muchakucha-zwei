import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useDesktop } from '../../ui/use-desktop';
import { assistantPath } from './assistant-boundary';

/**
 * 模型配置 is a centered window above the assistant on desktop and a subpage
 * elsewhere. A menu that offers it closes first; opening on the next frame lets
 * focus settle on that menu's trigger, which the window then returns to.
 */
export function useModelSettingsEntry(householdId: string) {
  const router = useRouter();
  const window = useDesktop();
  const open = useCallback((fromDialog = false) => {
    const go = () => {
      rememberRouteTrigger();
      router.push(`${assistantPath(householdId)}/providers`);
    };
    if (fromDialog) requestAnimationFrame(go);
    else go();
  }, [router, householdId]);
  return { window, open };
}
