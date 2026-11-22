import { useTranslation } from '../../../../../src/i18n';
import { notifyContentChanged } from '../../../../../src/features/content/content-changes';
import { useRef } from 'react';
import { EventWindow, useEventWindowClose } from '../../../../../src/features/events/event-window';
import { toDateIso } from '../../../../../src/features/events/calendar-utils';
import { useCreateWithLabels } from '../../../../../src/features/households/use-create-with-labels';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../src/ui/workspace-state';
import { useLocalSearchParams } from 'expo-router';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../src/ui/household-components';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../src/features/events/event-form';
import { Banner, Stack } from '../../../../../src/ui/primitives';
import type { CreateEventDto } from '@muchakucha/api-client';

export default function CreateEventRoute() {
  const { t } = useTranslation(['events', 'tasks', 'shared']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:events:new:`;
  const { close } = useEventWindowClose();
  const exitAllowed = useRef(false);
  const [selectedDate] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, toDateIso(new Date()));
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);

  const { submit, pending: isSubmitting, error: error } = useCreateWithLabels<CreateEventDto>({
    create: async (data) => {
      const token = sessionTransport.getAccessToken();
      if (token === null) throw new Error('Session expired');
      return sessionApiClient.createEvent(token, id!, data);
    },
    onComplete: () => {
      workspace.clear(draftPrefix);
      notifyContentChanged(id);
      exitAllowed.current = true;
      close();
    },
  });
  const handleSubmit = (data: CreateEventDto) => submit(data, selectedLabelIds);

  return (
    <EventWindow draftPrefix={draftPrefix} title={t('create')} busy={isSubmitting} exitAllowed={exitAllowed}>

        <Stack gap={4}>
          <HouseholdContextNote householdName={householdName} />
          {error !== null ? <Banner>{error}</Banner> : null}
          <EventForm
            draftKey={draftPrefix + 'form'}
            defaultDate={selectedDate ?? toDateIso(new Date())}
            onSubmit={handleSubmit}
            onCancel={close}
            submitLabel={t('shared:create')}
            isSubmitting={isSubmitting}
            householdId={id}
            selectedLabelIds={selectedLabelIds}
            onLabelChange={setSelectedLabelIds}
          />
        </Stack>

    </EventWindow>
  );
}
