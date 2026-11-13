import { useTranslation } from '../../../../../../src/i18n';
import { RouteWindow, useEditWindowExit } from '../../../../../../src/ui/route-window';
import RecurrenceListScreen from '../../../../../../src/features/recurrence/recurrence-list-screen';
import { DraftNotice } from '../../../../../../src/ui/draft-notice';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../../src/ui/workspace-state';
import { notifyContentChanged } from '../../../../../../src/features/content/content-changes';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Repeat from 'lucide-react-native/icons/repeat';
import { useTheme } from '@shopify/restyle';
import { ApiClientError, type RecurrenceRuleListItemDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { RecurrenceKindBadge } from '../../../../../../src/features/recurrence/recurrence-kind-badge';
import {
  followStartDate,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../../../../../../src/features/recurrence/recurrence-options';
import { RecurrenceField } from '../../../../../../src/features/recurrence/recurrence-field';
import { FormRow, FormSection, ROW_CONTENT_INSET, rowIcon } from '../../../../../../src/ui/compose-rows';
import {
  formatRuleRow,
  nextDayIsoIn,
} from '../../../../../../src/features/recurrence/recurrence-rule-row';
import {
  AccessChangedPanel,
  AppShell,
} from '../../../../../../src/ui/household-components';
import { Banner, ConfirmActions, FormActions, FormMessage, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

// One copy for every 404 cause. Saying the rule "was taken away" would assert
// a history the client cannot know, and would confirm that a rule belonging to
// another household exists at all (T-07-46) — so this says only what is true
// from the user's side: they cannot see it.

function resolveDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * 编辑重复安排: the rule's repeat settings, applied from tomorrow on. It opens
 * from the rule's detail and returns there after saving; ending a series is an
 * action of the detail, not of this form.
 */
export default function RecurrenceRuleEditRoute() {
  const { t } = useTranslation(['recurrence', 'auth', 'households', 'common']);
  const { id, ruleId } = useLocalSearchParams<{ id: string; ruleId: string }>();
  const router = useRouter();
  const exitAllowed = useRef(false);
  const exitEdit = useEditWindowExit('recurrence-rules', ruleId);
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [rule, setRule] = useState<RecurrenceRuleListItemDto | null>(null);
  const formKey = `draft:${id}:recurrence-rules:${ruleId}:form`;
  const [recurrence, setRecurrence] = useWorkspaceState<RecurrenceInput | null>(formKey, null);
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'rule.loadError' | 'rule.notFound' | null>(null);
  const [writeError, setWriteError] = useState<'rule.saveError' | 'rule.saveForbidden' | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const deviceTimeZone = resolveDeviceTimeZone();

  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:recurrence-rules:${ruleId}:`;
  const conflict = useEditConflict(draftPrefix, rule, async () => {
    const token = await sessionTransport.getAccessToken();
    if (!token) throw new Error('Session expired');
    return sessionApiClient.getRecurrenceRule(token, householdId!, ruleId!);
  }, setRule);

  const fetchRule = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.getRecurrenceRule(token, householdId, ruleId);
      captureEditBaseline(workspace, draftPrefix, result);
      setRule(result);
      // The picker is seeded once from the authoritative rule, already moved to
      // tomorrow the way the field moves it, so opening the form is not an edit.
      // A refetch after a failed write keeps whatever is on screen.
      const seeded = recurrenceInputFromResponse(result);
      if (seeded !== null) workspace.seed(formKey, followStartDate(seeded, nextDayIsoIn(result.timezone), false));
      loadedOnce.current = true;
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiClientError && caught.status === 404 ? 'rule.notFound' : 'rule.loadError',
      );
    } finally {
      setLoading(false);
    }
  }, [householdId, ruleId, workspace, draftPrefix, formKey]);

  useFocusEffect(
    useCallback(() => {
      void fetchRule();
    }, [fetchRule]),
  );

  // Only a confirm action writes. The trigger below merely opens this step.
  const handleConfirmSave = useCallback(async () => {
    if (householdId === undefined || householdId === '' || ruleId === undefined || ruleId === '') {
      return;
    }
    if (recurrence === null) return;
    setSaving(true);
    setWriteError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setWriteError('rule.saveError');
        return;
      }
      await sessionApiClient.updateRecurrenceRule(token, householdId, ruleId, { recurrence, expectedUpdatedAt: conflict.precondition.expectedUpdatedAt });
      workspace.clear(draftPrefix);
      setSaveConfirmOpen(false);
      // Back to the detail, which re-reads the rule; a list kept beside it re-reads too.
      notifyContentChanged(householdId);
      exitAllowed.current = true;
      exitEdit();
    } catch (caught: unknown) {
      if (conflict.handle(caught)) { setSaveConfirmOpen(false); return; }
      // Every picker edit is kept: a failed write changed nothing server-side,
      // so throwing away the user's input would be the only real loss.
      setWriteError(
        caught instanceof ApiClientError && caught.status === 403 ? 'rule.saveForbidden' : 'rule.saveError',
      );
    } finally {
      setSaving(false);
    }
  }, [householdId, ruleId, recurrence, exitEdit, conflict, workspace, draftPrefix]);

  const formatted = rule === null ? null : formatRuleRow(rule, deviceTimeZone);
  const ended = formatted?.ended ?? false;
  // The split anchor: tomorrow in the RULE's timezone. Memoized so the picker's
  // startsOn-sync effect sees a stable value instead of a fresh one per render.
  const anchor = useMemo(
    () => (rule === null ? null : nextDayIsoIn(rule.timezone)),
    [rule],
  );
  // The split starts tomorrow, so an end date must come after it.
  const endsOnInvalid = anchor !== null && recurrence?.endsOn !== undefined && recurrence.endsOn <= anchor;

  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel={t('households:accessChanged')}>
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { void router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel={t('households:pageMissing')}>
        <Stack gap={4}>
          <Text>{t('households:pageUnavailable')}</Text>
        </Stack>
      </AppShell>
    );
  }

  const close = () => {
    if (saveConfirmOpen) setSaveConfirmOpen(false);
    else exitEdit();
  };
  return (
      <RouteWindow draftPrefix={draftPrefix} resource="recurrence-rules" size={saveConfirmOpen ? 'standard' : 'editor'} title={saveConfirmOpen ? t('rule.saveTitle') : t('rule.edit')} busy={saving} onClose={close} onBackStep={saveConfirmOpen ? close : undefined} exitAllowed={exitAllowed} fallback={<RecurrenceListScreen />}>
        {saveConfirmOpen ? <Stack gap={3}>
          <Text>{t('rule.savePrompt')}</Text>
          {writeError ? <Banner>{t(writeError)}</Banner> : null}
          <ConfirmActions confirmLabel={t('rule.confirmSave')} busy={saving} onCancel={close} onConfirm={() => { void handleConfirmSave(); }} />
        </Stack> : <>
        <Stack gap={4}>
          {writeError !== null && <Banner>{t(writeError)}</Banner>}

          {loading && <LoadingState label={t('rule.loading')} />}

          {error !== null && <LoadError message={t(error)} onRetry={() => void fetchRule()} />}

          {rule !== null && formatted !== null && anchor !== null && (
            <Stack gap={0}>
              <DraftNotice />
              {conflict.panel}
              <FormRow>
                <Stack gap={2} style={{ flex: 1, paddingVertical: activeTheme.spacing[3] }}>
                  {/* Never truncated: the template title is the rule's identity. */}
                  <Heading level={2}>{formatted.title}</Heading>
                  <View style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: activeTheme.spacing[2],
                  }}>
                    {rule.kind !== null && <RecurrenceKindBadge kind={rule.kind} />}
                  </View>
                </Stack>
              </FormRow>

              <FormSection>
                {/* `startDate` is the split anchor (tomorrow), NOT the rule's
                    original startsOn: saved changes apply from tomorrow on.
                    不重复 stays disabled; ending the series is its own action. */}
                <RecurrenceField
                  name={t('rule.label')}
                  icon={rowIcon(Repeat)}
                  value={recurrence}
                  onChange={setRecurrence}
                  startDate={anchor}
                  disabled={ended || saving}
                  disableTurnOff
                  turnOffHint={t('rule.turnOffHint')}
                />
                {/* Always visible, because a rule-level edit can only ever mean
                    "this and everything after". A scope sheet with one live
                    option would be noise, so there is none. */}
                <Text variant="caption" color="inkMuted" style={{ paddingLeft: ROW_CONTENT_INSET, paddingBottom: activeTheme.spacing[2] }}>{t('rule.scope')}</Text>
                {endsOnInvalid ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><FormMessage>{t('rule.endDateError')}</FormMessage></View> : null}
                {ended ? <Text variant="caption" color="inkMuted" style={{ paddingLeft: ROW_CONTENT_INSET }}>{t('rule.endedNote')}</Text> : null}
              </FormSection>

              <FormActions
                onCancel={close}
                onSubmit={() => setSaveConfirmOpen(true)}
                submitting={false}
                submitLabel={t('common:save')}
                disabled={ended || saving || saveConfirmOpen || recurrence === null || endsOnInvalid}
              />
            </Stack>
          )}
        </Stack>
        </>}
      </RouteWindow>
  );
}
