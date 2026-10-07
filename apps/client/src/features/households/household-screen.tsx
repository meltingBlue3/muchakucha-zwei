import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { AccountMenu } from '../../ui/account-menu';
import type { ActionNoticeProps } from '../../ui/action-notice';
import { AccessChangedPanel, AppShell, HouseholdHeader, HouseholdSwitcher, InboxButton } from '../../ui/household-components';
import { familyPages, householdPath, HouseholdNavigation, type HouseholdTab } from '../../ui/household-navigation';
import { Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useHouseholdContext } from './household-context';

/**
 * The frame of a household destination: the household menu, the account, the
 * tab bar or sidebar, and the access-changed and not-found states every page
 * shares. Switching household keeps you on the same destination.
 */
export function HouseholdScreen({ active, accessibilityLabel, notice, refreshing, onRefresh, floatingAction, width, sidebar, layout, headerRow = true, tabBar = true, subpage = false, children }: {
  active: HouseholdTab;
  accessibilityLabel: string;
  notice?: ActionNoticeProps | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  floatingAction?: ReactNode;
  width?: 'reading' | 'wide';
  /** Page-specific content for the wide-screen sidebar. */
  sidebar?: ReactNode;
  layout?: 'document' | 'workspace';
  /** Off for a page with a header of its own, such as the assistant. */
  headerRow?: boolean;
  /** Off for a focused view on a phone, such as one conversation. */
  tabBar?: boolean;
  /**
   * A page reached from the household menu rather than a tab, such as 家庭设置:
   * on a phone it has a back button instead of the tab bar; a wide screen
   * keeps the sidebar with the page selected.
   */
  subpage?: boolean;
  children: ReactNode;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const narrow = useWindowDimensions().width < theme.layout.navigationBreakpoint;
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds, switchHousehold, rememberHousehold } = useHouseholdContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const householdId = id ?? currentHouseholdId;
  const householdName = households.find(h => h.id === householdId)?.name ?? '';

  // A link or a refresh can open another household than the remembered one.
  // Each page adopts its household once, when the list is first ready; it
  // stays out of the way while the menu switches household and then
  // replaces this page.
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (viewState !== 'ready' || !id || adopted.current === id) return;
    adopted.current = id;
    rememberHousehold(id);
  }, [viewState, id, rememberHousehold]);

  const handleSwitch = useCallback(async (nextId: string) => {
    if (nextId !== householdId && await switchHousehold(nextId)) {
      router.replace(householdPath(nextId, active));
    }
    setMenuOpen(false);
  }, [householdId, switchHousehold, router, active]);

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === null || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}><Text>这个页面暂时无法访问。</Text></Stack>
      </AppShell>
    );
  }

  const openMenu = () => setMenuOpen(true);
  return (
    <>
      <AppShell
        accessibilityLabel={accessibilityLabel}
        {...(subpage ? (narrow ? { showBack: true, showProfile: true, title: '' } : {}) : headerRow ? { showProfile: true, headerContent: <HouseholdHeader householdName={householdName} onOpenSwitcher={openMenu} /> } : {})}
        {...(layout ? { layout } : {})}
        footer={!narrow || (tabBar && !subpage) ? (
          <HouseholdNavigation
            householdId={householdId}
            active={active}
            header={<HouseholdHeader householdName={householdName} onOpenSwitcher={openMenu} placement="sidebar" />}
            footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[3] }}><InboxButton /><AccountMenu variant="row" /></View>}
          >
            {sidebar}
          </HouseholdNavigation>
        ) : undefined}
        notice={notice ?? null}
        refreshing={refreshing ?? false}
        {...(onRefresh ? { onRefresh } : {})}
        floatingAction={viewState === 'ready' ? floatingAction : null}
        {...(width ? { width } : {})}
      >
        {children}
      </AppShell>
      <HouseholdSwitcher
        currentHouseholdId={householdId}
        households={households}
        onCreateNew={() => { setMenuOpen(false); router.push('/households/new'); }}
        onClose={() => setMenuOpen(false)}
        onSelect={(next) => { void handleSwitch(next); }}
        visible={menuOpen}
        links={narrow ? familyPages.map(page => ({ label: page.label, icon: page.icon, onPress: () => router.push(householdPath(householdId, page.key)) })) : []}
      />
    </>
  );
}
