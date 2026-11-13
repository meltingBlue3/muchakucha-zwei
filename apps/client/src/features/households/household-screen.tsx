import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInboxCount } from '../inbox/use-inbox-count';
import { useCurrentUser } from '../auth/use-current-user';
import { PageHeaderContext, type PageHeader } from '../../ui/page-intro';
import { Heading } from '../../ui/primitives';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useDesktop } from '../../ui/use-desktop';
import { AccountNavigation } from '../profile/account-navigation';

import { AccountMenu } from '../../ui/account-menu';
import type { ActionNoticeProps } from '../../ui/action-notice';
import { AccessChangedPanel, AppShell, HouseholdHeader, HouseholdSwitcher, InboxButton } from '../../ui/household-components';
import { familyPages, householdPath, HouseholdNavigation, SidebarToggle, type HouseholdTab } from '../../ui/household-navigation';
import { useSidebarRail } from '../../ui/sidebar-rail';
import { CommandPalette, SearchEntry, useSearchShortcut } from '../search/command-palette';
import { useSidebarCounts } from './use-sidebar-counts';
import { Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useTranslation } from '../../i18n';
import { useHouseholdContext } from './household-context';

/**
 * The frame of a household destination: the household menu, the account, the
 * tab bar or sidebar, and the access-changed and not-found states every page
 * shares. Switching household keeps you on the same destination.
 */
export function HouseholdScreen({ active, accessibilityLabel, notice, refreshing, onRefresh, floatingAction, width, sidebar, layout, headerRow = true, tabBar = true, subpage = false, children, aside, detailOpen, paneWidth }: {
  detailOpen?: boolean;
  /** The width of a pane beside the page when it is not the usual detail width, such as a note beside Today. */
  paneWidth?: number | undefined;
  aside?: ReactNode;
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
  const { t } = useTranslation('navigation');
  const screenWidth = useWindowDimensions().width;
  const narrow = screenWidth < theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
  const { rail } = useSidebarRail();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<View>(null);
  useSearchShortcut(desktop, () => setSearchOpen(open => !open));
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds, switchHousehold, rememberHousehold } = useHouseholdContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const switcherTrigger = useRef<View>(null);
  const householdId = id ?? currentHouseholdId;
  const householdName = households.find(h => h.id === householdId)?.name ?? '';

  // The sidebar's inbox badge: how many invitations wait.
  const inboxCount = useInboxCount(!narrow);
  // The numbers beside 今日 and 任务.
  const counts = useSidebarCounts(householdId, desktop);

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
    // An account page belongs to no household, so it stays put after a switch.
    if (nextId !== householdId && await switchHousehold(nextId) && active !== 'account') {
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
        aside={aside}
        {...(detailOpen === undefined ? {} : { detailOpen })}
        paneWidth={paneWidth}
        {...(subpage ? (narrow ? { showBack: true, showProfile: true, title: '' } : {}) : headerRow ? { showProfile: true, headerContent: <HouseholdHeader householdName={householdName} onOpenSwitcher={openMenu} /> } : {})}
        {...(layout ? { layout } : {})}
        {...(!headerRow ? { pageHeader: false } : {})}
        footer={!narrow || (tabBar && !subpage) ? (
          <HouseholdNavigation
            householdId={householdId}
            active={active}
            belowActive={subpage}
            header={desktop ? <View style={{ gap: theme.spacing[4] }}>
              <View style={{ flexDirection: rail ? 'column' : 'row', alignItems: 'center', gap: theme.spacing[1] }}>
                <View style={rail ? undefined : { flex: 1, minWidth: 0 }}><HouseholdHeader trigger={switcherTrigger} householdName={householdName} onOpenSwitcher={openMenu} placement="sidebar" /></View>
                <SidebarToggle />
              </View>
              <SearchEntry rail={rail} trigger={searchTrigger} onPress={() => setSearchOpen(true)} />
            </View> : <HouseholdHeader trigger={switcherTrigger} householdName={householdName} onOpenSwitcher={openMenu} placement="sidebar" />}
            {...(counts ? { badges: {
              today: { value: counts.today, description: `今天 ${counts.today} 项安排`, tone: 'muted' as const },
              tasks: { value: counts.overdue, description: `${counts.overdue} 件逾期`, tone: 'accent' as const },
            } } : {})}
            footer={<View style={{ flexDirection: rail ? 'column' : 'row', alignItems: 'center', gap: theme.spacing[1], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[3] }}><AccountMenu variant="row" /><InboxButton count={inboxCount} /></View>}
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
        trigger={switcherTrigger}
        currentHouseholdId={householdId}
        households={households}
        onCreateNew={() => { setMenuOpen(false); router.push('/households/new'); }}
        onClose={() => setMenuOpen(false)}
        onSelect={(next) => { void handleSwitch(next); }}
        visible={menuOpen}
        links={narrow ? familyPages.map(page => ({ label: t(`pages.${page.key}`), icon: page.icon, onPress: () => router.push(householdPath(householdId, page.key)) })) : []}
      />
      {desktop && searchOpen ? <CommandPalette householdId={householdId} trigger={searchTrigger} onClose={() => setSearchOpen(false)} /> : null}
    </>
  );
}

/**
 * A page of the person rather than of a household, such as 收件箱 or 个人中心.
 * A wide screen keeps the current household's sidebar around it, so reaching
 * it from the sidebar does not drop the whole frame. A phone, or an account
 * that has no household yet, shows it as a plain page with a back button.
 */
export function AccountScreen({ accessibilityLabel, refreshing, onRefresh, showInbox = true, children }: {
  accessibilityLabel: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Off on the inbox itself. */
  showInbox?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const wide = useWindowDimensions().width >= theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
  const { currentHouseholdId } = useHouseholdContext();
  const refresh = { ...(refreshing === undefined ? {} : { refreshing }), ...(onRefresh ? { onRefresh } : {}) };
  const content = desktop ? <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}><AccountNavigation /><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing[10], paddingVertical: theme.spacing[8], width: '100%', maxWidth: theme.layout.accountContentWidth + theme.spacing[10] * 2 }}><AccountContent>{children}</AccountContent></ScrollView></View> : children;
  if (wide && currentHouseholdId !== null) {
    return <HouseholdScreen active="account" subpage accessibilityLabel={accessibilityLabel} width="reading" {...(desktop ? { layout: 'workspace' as const } : {})} {...refresh}>{content}</HouseholdScreen>;
  }
  return (
    <AppShell title="" accessibilityLabel={accessibilityLabel} showBack showProfile showInbox={showInbox} width="reading" {...(desktop ? { layout: 'workspace' as const } : {})} {...refresh}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/household-handoff')}>
      {content}
    </AppShell>
  );
}

/**
 * Desktop: every account page keeps 个人中心 and the person in the workspace
 * header, and the page's own title (提醒, 收件箱 …) heads its content beside
 * the account navigation.
 */
function AccountContent({ children }: { children: ReactNode }) {
  const setShellHeader = useContext(PageHeaderContext);
  const user = useCurrentUser();
  const [section, setSection] = useState<PageHeader | null>(null);
  const who = user ? `${user.displayName} · ${user.username}` : undefined;
  useLayoutEffect(() => {
    if (!setShellHeader) return undefined;
    setShellHeader({ title: '个人中心', ...(who ? { subtitle: who } : {}) });
    return () => setShellHeader(null);
  }, [setShellHeader, who]);
  return <PageHeaderContext.Provider value={setSection}>
    {section ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], marginBottom: theme.spacing[5] }}>
      <Heading level={2} style={theme.typography.paneTitle}>{section.title}</Heading>
      {section.subtitle ? typeof section.subtitle === 'string' ? <Text variant="meta">{section.subtitle}</Text> : section.subtitle : null}
      <View style={{ flex: 1 }} />
      {section.action}
    </View> : null}
    {children}
  </PageHeaderContext.Provider>;
}
