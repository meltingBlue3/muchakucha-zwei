import { useRef } from 'react';
import { EventWindow, useEventWindowClose } from '../../../../../src/features/events/event-window';
import { toDateIso } from '../../../../../src/features/events/calendar-utils';
import { DraftNotice } from '../../../../../src/ui/draft-notice';
import { useCreateWithLabels } from '../../../../../src/features/households/use-create-with-labels';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams } from 'expo-router';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../src/ui/household-components';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../src/features/events/event-form';
import { Banner, LoadError, Stack } from '../../../../../src/ui/primitives';
import type { CreateEventDto } from '@muchakucha/api-client';

export default function CreateEventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:events:new:`;
  const { close } = useEventWindowClose();
  const exitAllowed = useRef(false);
  const [selectedDate] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, toDateIso(new Date()));
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);

  const { submit, retry, created, pending: isSubmitting, error: error } = useCreateWithLabels<CreateEventDto>({
    key: draftPrefix + 'created',
    create: async (data) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.createEvent(token, id!, data);
    },
    tag: async (resourceId, labelIds) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.tagEvent(token, id!, resourceId, { labelIds });
    },
    onComplete: () => { workspace.clear(draftPrefix); exitAllowed.current = true; close(); },
  });
  const handleSubmit = (data: CreateEventDto) => submit(data, selectedLabelIds);

  return (
    <EventWindow title="创建日程" busy={isSubmitting} exitAllowed={exitAllowed}>

        <Stack gap={4}>
          <HouseholdContextNote householdName={householdName} />
          {error !== null && created === null ? <Banner>{error}</Banner> : null}
          {created !== null ? <Stack gap={4}><DraftNotice /><LoadError title="日程已创建" message={error ?? '内容已创建，标签尚未保存。'} retryLabel="重试保存标签" retrying={isSubmitting} onRetry={() => void retry()} /></Stack> : <EventForm
            draftKey={draftPrefix + 'form'}
            defaultDate={selectedDate ?? toDateIso(new Date())}
            onSubmit={handleSubmit}
            onCancel={close}
            submitLabel="创建"
            isSubmitting={isSubmitting}
            householdId={id}
            selectedLabelIds={selectedLabelIds}
            onLabelChange={setSelectedLabelIds}
          />}
        </Stack>

    </EventWindow>
  );
}
