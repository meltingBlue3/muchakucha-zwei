import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { CreateEventDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import BirthdayListScreen from '../../../../../src/features/birthdays/birthday-list-screen';
import { BirthdayForm } from '../../../../../src/features/birthdays/birthday-form';
import { notifyContentChanged } from '../../../../../src/features/content/content-changes';
import { toDateIso } from '../../../../../src/features/events/calendar-utils';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../src/ui/household-components';
import { Banner, LoadError, Stack } from '../../../../../src/ui/primitives';
import { RouteWindow, useRouteWindowClose } from '../../../../../src/ui/route-window';
import { useWorkspaceState, useWorkspaceStore } from '../../../../../src/ui/workspace-state';

const SAVE_ERROR = '生日没有保存成功，请检查网络后重试。';

/**
 * 添加生日. Saving creates one yearly series per birthday, one after the other;
 * how many are already saved is kept with the draft, so a retry after a
 * failure creates only the rest and never a second copy.
 */
export default function CreateBirthdayRoute() {
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
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const todayIso = toDateIso(new Date());

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await sessionTransport.getAccessToken();
      if (token === null || !id) return;
      try {
        const household = await sessionApiClient.getHousehold(token, id);
        if (!active) return;
        // 我 first, then everyone else by the name the household knows them by.
        setPeople(['我', ...household.members.filter(member => !member.isCurrentUser).map(member => member.displayName)]);
      } catch {
        // Without the members the name is typed in full.
      }
    })();
    return () => { active = false; };
  }, [id]);

  const save = useCallback(async (events: CreateEventDto[]) => {
    setPending(events);
    setSubmitting(true);
    setError(null);
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
      setError(SAVE_ERROR);
    } finally {
      setSubmitting(false);
    }
  }, [close, draftPrefix, id, saved, setSaved, workspace]);

  const partly = saved.length > 0 && error !== null;
  return (
    <RouteWindow draftPrefix={draftPrefix} resource="birthdays" title="添加生日" busy={submitting} exitAllowed={exitAllowed} fallback={<BirthdayListScreen />}>
      <Stack gap={4}>
        <HouseholdContextNote householdName={householdName} />
        {error !== null && !partly ? <Banner>{error}</Banner> : null}
        {partly ? (
          <LoadError
            title={`已保存${saved.join('、')}`}
            message={`${pending.filter(event => !saved.includes(event.title)).map(event => event.title).join('、') || '其余的生日'}还没有保存。`}
            retryLabel="继续保存"
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
