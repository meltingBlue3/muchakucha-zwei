import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { LabelChip } from '../labels/label-chip';
import { formatDateRange } from './calendar-utils';

interface EventCardProps {
  event: EventResponseDto;
  onPress: (event: EventResponseDto) => void;
}

export function EventCard({ event, onPress }: EventCardProps) {
  const activeTheme = useTheme<Theme>();

  return (
    <Pressable
      onPress={() => onPress(event)}
      accessibilityLabel={`事件：${event.title}`}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.md,
        padding: activeTheme.spacing[4],
        borderWidth: 1,
        borderColor: activeTheme.colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Stack gap={1}>
        <Text variant="label" numberOfLines={1}>
          {event.title}
        </Text>
        <Text variant="caption">
          {formatDateRange(event.startTime, event.endTime, event.allDay)}
        </Text>
        {event.location !== null && event.location !== '' && (
          <Text variant="bodySm" numberOfLines={1}>
            📍 {event.location}
          </Text>
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
