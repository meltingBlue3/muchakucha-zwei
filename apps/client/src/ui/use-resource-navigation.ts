import { usePathname, useRouter } from 'expo-router';
import { useDesktop } from './use-desktop';
import { rememberRouteTrigger } from '../platform/overlays/route-trigger';

/** Switching rows reuses the open pane and retains the original list route. */
export function useResourceNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useDesktop();
  return (href: `/households/${string}`) => {
    rememberRouteTrigger();
    if (desktop && /\/(tasks|events|notes|recurrence-rules)\/[^/]+(?:\/edit)?$/.test(pathname)) router.replace(href);
    else router.push(href);
  };
}
