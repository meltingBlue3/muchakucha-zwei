import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { CreateEventDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import BirthdayListScreen from '../../../../../src/features/birthdays/birthday-list-screen';
import { BirthdayForm } from '../../../../../src/features/birthdays/birthday-form';
import { notifyContentChanged } from '../../../../../src/features/content/content-changes';
import { toDateIso } from '../../../../../src/features/events/calendar-utils';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { useTranslation } from '../../../../../src/i18n';
import { HouseholdContextNote } from '../../../../../src/ui/household-components';
import { Banner, LoadError, Stack } from '../../../../../src/ui/primitives';
import { RouteWindow, useRouteWindowClose } from '../../../../../src/ui/route-window';
import { useWorkspaceState, useWorkspaceStore } from '../../../../../src/ui/workspace-state';

/**
 * 添加生日. Saving creates one yearly series per birthday, one after the other;
 * how many are already saved is kept with the draft, so a retry after a
 * failure creates only the rest and never a second copy.
 */
export default function CreateBirthdayRoute() {
  const { t } = useTranslation('birthdays');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:birthdays:new:`;
  const { close } = useRouteWindowClose('birthdays');
  const exitAllowed = useRef(false);
  const [pending, setPending] = useState<CreateEventDto[]>([]);
  const [saved, setSaved] = useWorkspaceState<string[]>(draftPrefix + 'saved', []);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Everyone else in the household, by the name it knows them by; null until loaded. */
  const [others, setOthers] = useState<string[] | null>(null);
  const todayIso = toDateIso(new Date());

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await sessionTransport.getAccessToken();
      if (token === null || !id) return;
      try {
        const household = await sessionApiClient.getHousehold(token, id);
        if (!active) return;
        setOthers(household.members.filter(member => !member.isCurrentUser).map(member => member.displayName));
      } catch {
        // Without the members the name is typed in full.
      }
    })();
    return () => { active = false; };
  }, [id]);

  const save = useCallback(async (events: CreateEventDto[]) => {
    setPending(events);
    setSubmitting(true);
    setFailed(false);
    const done = [...saved];
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      for (const event of events) {
        if (done.includes(event.title)) continue;
        await sessionApiClient.createEvent(token, id!, event);
        done.push(event.title);
        setSaved([...done]);
      }
      workspace.clear(draftPrefix);
      notifyContentChanged(id);
      exitAllowed.current = true;
      close();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }, [close, draftPrefix, id, saved, setSaved, workspace]);

  // 我 first, then everyone else.
  const people = others === null ? [] : [t('me'), ...others];
  const partly = saved.length > 0 && failed;
  const unsaved = pending.filter(event => !saved.includes(event.title)).map(event => event.title);
  return (
    <RouteWindow draftPrefix={draftPrefix} resource="birthdays" title={t('add')} busy={submitting} exitAllowed={exitAllowed} fallback={<BirthdayListScreen />}>
      <Stack gap={4}>
        <HouseholdContextNote householdName={householdName} />
        {failed && !partly ? <Banner>{t('save.error')}</Banner> : null}
        {partly ? (
          <LoadError
            title={t('save.saved', { titles: saved.join(t('save.separator')) })}
            message={t('save.pending', { titles: unsaved.join(t('save.separator')) || t('save.rest') })}
            retryLabel={t('save.continue')}
            retrying={submitting}
            onRetry={() => void save(pending)}
          />
        ) : (
          <BirthdayForm draftKey={draftPrefix + 'form'} people={people} todayIso={todayIso} submitting={submitting} onSubmit={events => void save(events)} onCancel={close} />
        )}
      </Stack>
    </RouteWindow>
  );
}
