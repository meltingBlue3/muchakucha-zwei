import { CardActionsMenu } from '../../ui/card-actions-menu';
import { View } from 'react-native';
import { ContentCard } from '../../ui/content-card';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Inline, Stack, Text } from '../../ui/primitives';
import { LabelChip } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { formatDateRange } from './calendar-utils';
import MapPin from 'lucide-react-native/icons/map-pin';

interface EventCardProps {
  onDelete?: (() => void) | undefined;
  event: EventResponseDto;
  onPress: (event: EventResponseDto) => void;
}

export function EventCard({ event, onPress, onDelete }: EventCardProps) {
  const activeTheme = useTheme<Theme>();

  return (
    <ContentCard
      accessibilityLabel={`日程：${event.title}${event.recurrenceRuleId == null ? '' : '，重复'}`}
      onPress={() => onPress(event)}
      trailing={onDelete ? <CardActionsMenu label={`删除日程：${event.title}`} onPress={onDelete} /> : null}
    >
      <Stack gap={1}>
        <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={2}>
          {event.title}
        </Text>
        <Inline gap={1} style={{ flexWrap: 'wrap' }}>
          <Text variant="caption">
            {formatDateRange(event.startTime, event.endTime, event.allDay)}
          </Text>
          {event.recurrenceRuleId != null && <RecurrenceBadge />}
        </Inline>
        {event.location !== null && event.location !== '' && (
          <Inline gap={1}>
            <MapPin color={activeTheme.colors.inkMuted} size={activeTheme.controlSizes.icon} />
            <Text variant="bodySm" numberOfLines={2} style={{ flex: 1 }}>{event.location}</Text>
          </Inline>
        )}
        {event.description !== null && event.description !== '' && (
          <Text variant="bodySm" numberOfLines={2} color="inkMuted">
            {event.description}
          </Text>
        )}
        {(event.labels ?? []).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[1] }}>
            {(event.labels ?? []).map((label) => (
              <LabelChip key={label.id} label={label} small />
            ))}
          </View>
        )}
      </Stack>
    </ContentCard>
  );
}
