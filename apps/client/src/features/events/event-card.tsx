import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Inline, Stack, Text } from '../../ui/primitives';
import { LabelChip } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { formatDateRange } from './calendar-utils';
import MapPin from 'lucide-react-native/icons/map-pin';

interface EventCardProps {
  event: EventResponseDto;
  onPress: (event: EventResponseDto) => void;
}

export function EventCard({ event, onPress }: EventCardProps) {
  const activeTheme = useTheme<Theme>();

  return (
    <Pressable
      onPress={() => onPress(event)}
      accessibilityRole="button"
      accessibilityLabel={`事件：${event.title}${event.recurrenceRuleId == null ? '' : '，重复'}`}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.xl,
        padding: activeTheme.spacing[5],
        borderWidth: 1,
        borderColor: activeTheme.colors.separator,
        borderLeftWidth: activeTheme.spacing[1],
        borderLeftColor: activeTheme.colors.coral,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Stack gap={2}>
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
    </Pressable>
  );
}
