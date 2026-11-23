import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInboxCount } from '../inbox/use-inbox-count';
import { useCurrentUser } from '../auth/use-current-user';
import { PageHeaderContext, type PageHeader } from '../../ui/page-intro';
import { Heading } from '../../ui/primitives';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { HouseholdSeal, SealStack, type HouseholdMark } from '../../ui/household-seal';
import { overviewHouseholds, useHouseholdMarks } from './household-marks';
import { useDesktop } from '../../ui/use-desktop';
import { AccountNavigation } from '../profile/account-navigation';

import { AccountMenu } from '../../ui/account-menu';
import type { ActionNoticeProps } from '../../ui/action-notice';
import { AccessChangedPanel, AppShell, HouseholdHeader, HouseholdSwitcher, InboxButton } from '../../ui/household-components';
import { familyPages, householdPath, HouseholdNavigation, isTimePage, overviewPath, SidebarToggle, type HouseholdTab } from '../../ui/household-navigation';
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
export function HouseholdScreen({ active, accessibilityLabel, notice, refreshing, onRefresh, floatingAction, width, sidebar, layout, headerRow = true, tabBar = true, subpage = false, children, aside, detailOpen, paneWidth, overview = false }: {
  /** A 总览 page: it shows the chosen households together rather than one. */
  overview?: boolean;
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
  const { t } = useTranslation(['households', 'navigation']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const screenWidth = useWindowDimensions().width;
  const narrow = screenWidth < theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
  const { rail } = useSidebarRail();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<View>(null);
  useSearchShortcut(desktop, () => setSearchOpen(open => !open));
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds, switchHousehold, rememberHousehold, overviewAvailable, scope, setScope } = useHouseholdContext();
  // `scope` lists every household with the 总览 on top; `family` only the
  // households, for the pages that belong to one (笔记, 助手 …).
  const [menu, setMenu] = useState<'scope' | 'family' | null>(null);
  const switcherTrigger = useRef<View>(null);
  const familyTrigger = useRef<View>(null);
  const householdId = overview ? currentHouseholdId : id ?? currentHouseholdId;
  const household = households.find(h => h.id === householdId);
  const householdName = household?.name ?? '';
  const marks = useHouseholdMarks();
  const mark = householdId ? marks.get(householdId) : undefined;
  const included = overviewHouseholds(households);
  const timePage = isTimePage(active);
  // 今日, 日历 and 任务 lead where the person last looked: the 总览 or this household.
  const timeScope = overview ? 'overview' : timePage ? 'household' : scope;

  // The sidebar's inbox badge: how many invitations wait.
  const inboxCount = useInboxCount(!narrow);
  // The numbers beside 今日 and 任务, which count one household's items.
  const counts = useSidebarCounts(timeScope === 'household' ? householdId : null, desktop);

  // Opening 今日, 日历 or 任务 records what they show, so the other pages and
  // the next launch lead back to it.
  useEffect(() => {
    if (viewState !== 'ready' || !timePage || !overviewAvailable) return;
    const shown = overview ? 'overview' : 'household';
    if (scope !== shown) setScope(shown);
  }, [viewState, timePage, overview, overviewAvailable, scope, setScope]);

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

  // A wide sidebar keeps the 总览 at its top while the person is in it, even on
  // a household's own page; a phone's header names that page's household.
  const showsOverview = overview || (desktop && timeScope === 'overview');

  const handleSwitch = useCallback(async (nextId: string) => {
    // Choosing a household from the menu that offers the 总览 leaves the 总览.
    const leavingOverview = menu === 'scope' && timeScope === 'overview';
    const fromFamilyMenu = menu === 'family';
    setMenu(null);
    if (leavingOverview) setScope('household');
    if (nextId === householdId) {
      // From the 总览 to the household it already keeps for its own pages.
      if (overview) router.replace(householdPath(nextId, active));
      return;
    }
    // An account page belongs to no household, so it stays put after a switch;
    // a 总览 page stays when only its household pages change hands.
    if (await switchHousehold(nextId) && active !== 'account' && !(overview && fromFamilyMenu)) {
      router.replace(householdPath(nextId, active));
    }
  }, [householdId, switchHousehold, router, active, menu, overview, timeScope, setScope]);

  const openOverview = useCallback(() => {
    setMenu(null);
    if (overview) return;
    setScope('overview');
    if (isTimePage(active)) router.replace(overviewPath(active));
  }, [overview, active, router, setScope]);

  // A link to the 总览 after leaving all but one household opens that household instead.
  useEffect(() => {
    if (overview && viewState === 'ready' && !overviewAvailable && currentHouseholdId && isTimePage(active)) {
      router.replace(householdPath(currentHouseholdId, active));
    }
  }, [overview, viewState, overviewAvailable, currentHouseholdId, active, router]);

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel={t('accessChanged')}>
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
      <AppShell accessibilityLabel={t('pageMissing')}>
        <Stack gap={4}><Text>{t('pageUnavailable')}</Text></Stack>
      </AppShell>
    );
  }

  // The menu at the top switches what 今日, 日历 and 任务 show; on a page of
  // one household it switches that household.
  const openMenu = () => setMenu(overviewAvailable && (timePage || showsOverview) ? 'scope' : 'family');
  const openFamilyMenu = () => setMenu('family');
  const overviewSummary = included.map(h => h.name).join(t('households:overview.separator'));
  const sealOf = (size: 'md' | 'lg') => showsOverview
    ? <SealStack marks={included.map(h => marks.get(h.id)).filter((m): m is HouseholdMark => m !== undefined)} size={size === 'lg' ? 'md' : 'sm'} />
    : overviewAvailable && mark ? <HouseholdSeal {...mark} size={size} /> : undefined;
  const headerName = showsOverview ? t('households:overview.name') : householdName;
  const headerLabel = showsOverview ? t('households:overview.current', { households: overviewSummary }) : undefined;
  const header = (placement: 'bar' | 'sidebar', trigger?: typeof switcherTrigger) => (
    <HouseholdHeader
      {...(trigger ? { trigger } : {})}
      householdName={headerName}
      onOpenSwitcher={openMenu}
      placement={placement}
      {...(sealOf(placement === 'sidebar' && desktop ? 'lg' : 'md') !== undefined ? { seal: sealOf(placement === 'sidebar' && desktop ? 'lg' : 'md') } : {})}
      {...(headerLabel ? { accessibilityLabel: headerLabel } : {})}
    />
  );
  const familyHeader = overview || timeScope === 'overview' ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.spacing[6] + 4, paddingHorizontal: theme.spacing[2] + 2 }}>
      {mark ? <HouseholdSeal {...mark} size="sm" /> : null}
      <Text variant="caption" color="inkMuted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{householdName}</Text>
      <Pressable
        ref={familyTrigger}
        accessibilityRole="button"
        accessibilityLabel={t('households:overview.switchFamily', { householdName })}
        onPress={openFamilyMenu}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ minHeight: theme.spacing[6], justifyContent: 'center', paddingHorizontal: theme.spacing[1], borderRadius: theme.borderRadii.sm, backgroundColor: pressed || hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}
      >
        <Text variant="caption" color="inkMuted" style={{ textDecorationLine: 'underline' }}>{t('households:overview.switchShort')}</Text>
      </Pressable>
    </View>
  ) : undefined;
  return (
    <>
      <AppShell
        accessibilityLabel={accessibilityLabel}
        aside={aside}
        notesLayout={active === 'notes'}
        {...(detailOpen === undefined ? {} : { detailOpen })}
        paneWidth={paneWidth}
        {...(subpage ? (narrow ? { showBack: true, showProfile: true, title: '' } : {}) : headerRow ? { showProfile: true, headerContent: header('bar') } : {})}
        {...(layout ? { layout } : {})}
        {...(!headerRow ? { pageHeader: false } : {})}
        footer={!narrow || (tabBar && !subpage) ? (
          <HouseholdNavigation
            householdId={householdId}
            active={active}
            belowActive={subpage}
            timeScope={timeScope}
            {...(familyHeader ? { familyHeader } : {})}
            header={desktop ? <View style={{ gap: theme.spacing[4] }}>
              <View style={{ flexDirection: rail ? 'column' : 'row', alignItems: 'center', gap: theme.spacing[1] }}>
                <View style={rail ? undefined : { flex: 1, minWidth: 0 }}>{header('sidebar', switcherTrigger)}</View>
                <SidebarToggle />
              </View>
              <SearchEntry rail={rail} trigger={searchTrigger} onPress={() => setSearchOpen(true)} />
            </View> : header('sidebar', switcherTrigger)}
            {...(counts ? { badges: {
              today: { value: counts.today, description: t('todayCount', { count: counts.today }), tone: 'muted' as const },
              tasks: { value: counts.overdue, description: t('overdueCount', { count: counts.overdue }), tone: 'accent' as const },
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
        trigger={menu === 'family' && familyTrigger.current ? familyTrigger : switcherTrigger}
        currentHouseholdId={householdId}
        households={households}
        onCreateNew={() => { setMenu(null); router.push('/households/new'); }}
        onClose={() => setMenu(null)}
        onSelect={(next) => { void handleSwitch(next); }}
        visible={menu !== null}
        {...(overviewAvailable ? { marks } : {})}
        {...(menu === 'scope' ? { overview: { selected: showsOverview, summary: overviewSummary, onSelect: openOverview, onAdjust: () => router.push('/overview/households') } } : {})}
        links={narrow ? familyPages.map(page => ({ label: t(`navigation:pages.${page.key}`), icon: page.icon, onPress: () => router.push(householdPath(householdId, page.key)) })) : []}
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
  // The content column keeps its reading width and sits in the middle of the room beside the navigation.
  const content = desktop ? <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}><AccountNavigation /><ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing[10], paddingVertical: theme.spacing[8], width: '100%', maxWidth: theme.layout.accountContentWidth + theme.spacing[10] * 2, alignSelf: 'center' }}><AccountContent>{children}</AccountContent></ScrollView></View> : children;
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
  const { t } = useTranslation('profile');
  const setShellHeader = useContext(PageHeaderContext);
  const user = useCurrentUser();
  const [section, setSection] = useState<PageHeader | null>(null);
  const who = user ? `${user.displayName} · ${user.username}` : undefined;
  const title = t('pageTitle');
  useLayoutEffect(() => {
    if (!setShellHeader) return undefined;
    setShellHeader({ title, ...(who ? { subtitle: who } : {}) });
    return () => setShellHeader(null);
  }, [setShellHeader, title, who]);
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
