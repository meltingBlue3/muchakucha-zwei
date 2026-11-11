import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import type { EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { insetFocusRing } from '../../platform/focus-ring/focus-ring';
import { CalendarGrid } from '../../ui/picker-panels';
import { Heading, Stack, Text } from '../../ui/primitives';
import { GroupLabel, ListGroup, NowMarker } from '../../ui/list-group';
import { labelTint, theme } from '../../ui/theme';
import { useDesktopDensity } from '../../ui/use-desktop';
import { formatDate, formatWeekday, parseDateValue, toTimeValue } from '../../ui/date-values';
import { completionActionLabel } from '../tasks/task-completion';
import { isOverdue } from '../tasks/task-utils';
import type { TaskCardCompletionProps } from '../tasks/use-task-completion';
import { toDateIso } from './calendar-utils';

const minutes = (iso: string) => { const date = new Date(iso); return date.getHours() * 60 + date.getMinutes(); };
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const HOUR = theme.layout.timelineHourHeight;
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
/** Vertical offset of a minute of the day on the timeline. */
const at = (minute: number) => (minute - DAY_START) * HOUR / 60;
/** A task with a time is drawn as a half-hour marker. */
const TASK_SPAN = 30;
/** The marker's height: its half hour, less a hairline gap before the next one. */
const MARKER_HEIGHT = TASK_SPAN * HOUR / 60 - theme.spacing[1] / 2;
/** Share of the timeline width events keep when a task marker sits beside them. */
const BESIDE_TASK = 55;
/** An hour label this close to the now line would collide with its time. */
const NOW_LABEL_CLEARANCE = 20;
const circleSize = theme.spacing[3];

export function timelineLanes(events: EventResponseDto[]) {
  const sorted = [...events].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const groups: EventResponseDto[][] = [];
  let end = '';
  for (const event of sorted) {
    if (!groups.length || event.startTime >= end) { groups.push([]); end = event.endTime; }
    groups.at(-1)!.push(event);
    if (event.endTime > end) end = event.endTime;
  }
  return groups.flatMap(group => {
    const ends: string[] = [];
    const lanes = group.map(event => {
      let lane = ends.findIndex(end => end <= event.startTime);
      if (lane < 0) lane = ends.length;
      ends[lane] = event.endTime;
      return { event, lane };
    });
    return lanes.map(item => ({ ...item, columns: ends.length }));
  });
}

function eventColor(event: EventResponseDto) {
  return event.labels?.[0]?.color ?? theme.colors.inkMuted;
}

/** The small round mark of a task: an open ring, or filled ink with a check once it is done. */
function TaskMark({ attention, done = false, busy = false }: { attention: boolean; done?: boolean; busy?: boolean }) {
  return (
    <View style={{ width: circleSize, height: circleSize, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, borderWidth: done ? 0 : theme.borderWidths.focus - 0.5, borderColor: attention ? theme.colors.accent : theme.colors.border, backgroundColor: done ? theme.colors.primary : busy ? theme.colors.surfaceMuted : theme.colors.transparent }}>
      {done ? <Check size={circleSize - 2} color={theme.colors.surface} strokeWidth={theme.focus.width + 1} /> : null}
    </View>
  );
}

/**
 * A task with a time on the timeline: a half-hour marker whose ring completes
 * the task and whose body opens it. Ring and body are siblings, as in ListRow,
 * so Web never nests one button in another. A failed write is shown under the
 * marker it came from, with its retry.
 */
function TimelineTask({ task, top, placement, completion, onOpen }: { task: TaskResponseDto; top: number; placement: ViewStyle; completion: TaskCardCompletionProps; onOpen(): void }) {
  const [pressed, setPressed] = useState(false);
  const fine = useDesktopDensity();
  const { onToggleComplete, statusChanging, statusError, onRetryStatus } = completion;
  const done = task.status === 'completed';
  const unavailable = statusChanging || task.status === 'cancelled';
  // A fine pointer gets a ring as tall as the marker; a touch screen keeps a touch-wide column for it.
  const control = fine ? circleSize + theme.spacing[2] * 2 : theme.controlSizes.touchTarget;
  return (
    <View style={{ position: 'absolute', top, ...placement, ...(statusError !== null ? { zIndex: 1 } : {}), borderRadius: theme.borderRadii.sm, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface }}>
      <View style={{ flexDirection: 'row', height: MARKER_HEIGHT - theme.borderWidths.default * 2 }}>
        <Pressable
          {...insetFocusRing}
          accessibilityRole="button"
          accessibilityLabel={completionActionLabel(task.status)}
          accessibilityState={{ disabled: unavailable, busy: statusChanging }}
          disabled={unavailable}
          onPress={() => onToggleComplete(task)}
          style={({ pressed: down }) => ({ width: control, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.sm, backgroundColor: down ? theme.colors.surfaceMuted : theme.colors.transparent })}
        >
          <TaskMark attention={!done && isOverdue(task.dueDate ?? null)} done={done} busy={statusChanging} />
        </Pressable>
        <Pressable
          {...insetFocusRing}
          accessibilityRole="button"
          accessibilityLabel={`任务：${task.title}`}
          onPress={onOpen}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], paddingRight: theme.spacing[2] }}
        >
          <Text variant="time">{toTimeValue(new Date(task.dueDate!))}</Text>
          <Text variant="bodySm" color={done ? 'inkFaint' : 'ink'} numberOfLines={1} style={{ flexShrink: 1, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
        </Pressable>
      </View>
      {statusError !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.spacing[2], paddingLeft: control, paddingRight: theme.spacing[2], paddingBottom: theme.spacing[1] }}>
          <Text variant="meta" color="destructive" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>{statusError}</Text>
          {onRetryStatus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`重试：${task.title}`}
              onPress={onRetryStatus}
              style={({ pressed: down }) => ({ minHeight: fine ? MARKER_HEIGHT : theme.controlSizes.touchTarget, justifyContent: 'center', opacity: down ? 0.7 : 1 })}
            >
              <Text variant="meta" color="link" style={{ textDecorationLine: 'underline' }}>重试</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PaneTitle({ children }: { children: string }) {
  return <View style={{ height: theme.layout.paneHeaderHeight, paddingHorizontal: theme.spacing[4], justifyContent: 'center' }}><Heading variant="section">{children}</Heading></View>;
}

function TimelineEvent({ event, top, height, left, right, onPress }: { event: EventResponseDto; top: number; height: number; left: string; right: string; onPress(): void }) {
  const color = eventColor(event);
  const start = toTimeValue(new Date(event.startTime));
  // Under 45 minutes a block has room for one line, so the title shares it with the time.
  const short = height < HOUR * 0.75;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`日程：${event.title}`}
      onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', top, height, left: left as `${number}%`, right: right as `${number}%`, overflow: 'hidden', justifyContent: short ? 'center' : 'flex-start', paddingHorizontal: theme.spacing[2], paddingVertical: short ? 0 : theme.spacing[2], gap: theme.spacing[1] / 2, borderRadius: theme.borderRadii.sm, borderLeftWidth: theme.borderWidths.focus + 1, borderLeftColor: color, backgroundColor: labelTint(color), opacity: pressed ? 0.8 : 1 })}
    >
      {short ? (
        <Text variant="bodySm" color="ink" numberOfLines={1}>
          <Text variant="time">{start}</Text>{`  ${event.title}`}{event.location ? <Text variant="meta">{`  ${event.location}`}</Text> : null}
        </Text>
      ) : <>
        <Text variant="bodySm" color="ink" numberOfLines={1}>{event.title}</Text>
        <Text variant="time" numberOfLines={1}>{`${start}–${toTimeValue(new Date(event.endTime))}${event.location ? ` · ${event.location}` : ''}`}</Text>
      </>}
    </Pressable>
  );
}

function AgendaRow({ label, time, mark, title, onPress }: { label: string; time: string; mark: ReactNode; title: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.layout.desktopControl - theme.spacing[1], marginHorizontal: -theme.spacing[1], paddingHorizontal: theme.spacing[1], borderRadius: theme.borderRadii.sm, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
    >
      <View style={{ width: circleSize, alignItems: 'center' }}>{mark}</View>
      <Text variant="time" style={{ width: theme.spacing[10] + theme.spacing[1] }}>{time}</Text>
      <Text variant="bodySm" color="ink" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
    </Pressable>
  );
}

/** The next seven days after `date`, one block per day that has something on it. */
function UpcomingDays({ date, events, tasks, onOpenEvent, onOpenTask }: { date: string; events: EventResponseDto[]; tasks: TaskResponseDto[]; onOpenEvent(event: EventResponseDto): void; onOpenTask(task: TaskResponseDto): void }) {
  const days = Array.from({ length: 7 }, (_, index) => { const day = parseDateValue(date); day.setDate(day.getDate() + index + 1); return day; });
  const blocks = days.flatMap(day => {
    const iso = toDateIso(day);
    const dayEvents = events.filter(event => toDateIso(new Date(event.startTime)) === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const dayTasks = tasks.filter(task => task.dueDate && toDateIso(new Date(task.dueDate)) === iso).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    return dayEvents.length + dayTasks.length ? [{ day, iso, dayEvents, dayTasks }] : [];
  });
  if (!blocks.length) return <Text variant="bodySm">接下来 7 天没有安排。</Text>;
  return (
    <Stack gap={3}>
      {blocks.map(({ day, iso, dayEvents, dayTasks }) => (
        <View key={iso}>
          <Text variant="meta" style={{ marginBottom: theme.spacing[1] }}>{`${formatDate(day)} ${formatWeekday(day)}`}</Text>
          {dayEvents.map(event => <AgendaRow key={event.id} label={`接下来日程：${event.title}`} time={event.allDay ? '全天' : toTimeValue(new Date(event.startTime))} title={event.title} onPress={() => onOpenEvent(event)} mark={<View style={{ width: theme.borderWidths.focus + 1, height: circleSize + theme.spacing[1], borderRadius: theme.borderRadii.full, backgroundColor: eventColor(event) }} />} />)}
          {dayTasks.map(task => { const due = minutes(task.dueDate!); return <AgendaRow key={task.id} label={`接下来任务：${task.title}`} time={due === 0 ? '' : clock(due)} title={task.title} onPress={() => onOpenTask(task)} mark={<TaskMark attention={false} />} />; })}
        </View>
      ))}
    </Stack>
  );
}

export function DesktopToday({ date, nowMinutes, events, todayTasks, overdue, unscheduled, upcoming, upcomingEvents, renderTask, taskCompletion, onOpenEvent, onOpenTask, onSelectDate, detailOpen }: {
  detailOpen: boolean;
  upcomingEvents: EventResponseDto[];
  date: string; nowMinutes: number; events: EventResponseDto[]; todayTasks: TaskResponseDto[]; overdue: TaskResponseDto[]; unscheduled: TaskResponseDto[]; upcoming: TaskResponseDto[];
  renderTask(task: TaskResponseDto): ReactNode;
  /** The completion control's wiring for one task, the same the 待办 rows receive. */
  taskCompletion(task: TaskResponseDto): TaskCardCompletionProps;
  onOpenEvent(event: EventResponseDto): void; onOpenTask(task: TaskResponseDto): void; onSelectDate(date: string): void;
}) {
  const scroll = useRef<ScrollView>(null);
  const initialMinute = useRef(nowMinutes).current;
  const compact = useWindowDimensions().width < theme.layout.railBreakpoint;
  useEffect(() => { const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, initialMinute - DAY_START - 90) * HOUR / 60, animated: false })); return () => cancelAnimationFrame(frame); }, [initialMinute]);
  const allDay = events.filter(event => event.allDay || toDateIso(new Date(event.startTime)) < date);
  const timed = events.filter(event => !allDay.includes(event)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dateOnly = todayTasks.filter(task => task.dueDate && minutes(task.dueDate) === 0);
  const scheduled = todayTasks.filter(task => task.dueDate && minutes(task.dueDate) !== 0);
  const eventEnd = (event: EventResponseDto) => toDateIso(new Date(event.endTime)) > date ? DAY_END : minutes(event.endTime);
  const overlapsTask = (start: number, end: number) => scheduled.some(task => { const due = minutes(task.dueDate!); return due < end && due + TASK_SPAN > start; });
  const overlapsEvent = (due: number) => timed.some(event => minutes(event.startTime) < due + TASK_SPAN && eventEnd(event) > due);
  const nowShown = nowMinutes >= DAY_START && nowMinutes <= DAY_END;
  const markedDates = [date, ...upcoming.flatMap(task => task.dueDate ? [toDateIso(new Date(task.dueDate))] : []), ...upcomingEvents.map(event => toDateIso(new Date(event.startTime)))];
  const next = <Stack gap={5}>
    <CalendarGrid compact markedDates={markedDates} value={date} onSelect={onSelectDate} />
    <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4] }}>
      <GroupLabel>未来 7 天</GroupLabel>
      <UpcomingDays date={date} events={upcomingEvents} tasks={upcoming} onOpenEvent={onOpenEvent} onOpenTask={onOpenTask} />
    </View>
  </Stack>;
  const groups = [{ title: '逾期', tasks: overdue, tone: 'accent' as const }, { title: '今天', tasks: dateOnly, tone: 'muted' as const }, { title: '待安排', tasks: unscheduled, tone: 'muted' as const }].filter(group => group.tasks.length > 0);
  const column = { flexGrow: 0, borderLeftWidth: theme.borderWidths.default, borderLeftColor: theme.colors.separator } as const;
  const columnContent = { paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[4], gap: theme.spacing[5] } as const;
  return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <PaneTitle>时间安排</PaneTitle>
      {allDay.length ? <View style={{ flexDirection: 'row', paddingHorizontal: theme.spacing[3], marginBottom: theme.spacing[1] }}>
        <Text variant="time" style={{ width: theme.layout.timeColumn, paddingTop: theme.spacing[2] }}>全天</Text>
        <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>{allDay.map(event => {
          const last = new Date(new Date(event.endTime).getTime() - 1);
          const range = toDateIso(last) > toDateIso(new Date(event.startTime)) ? `${formatDate(new Date(event.startTime))} – ${formatDate(last)}` : '';
          return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`日程：${event.title}`} onPress={() => onOpenEvent(event)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1] + 2, borderRadius: theme.borderRadii.sm, borderLeftWidth: theme.borderWidths.focus + 1, borderLeftColor: eventColor(event), backgroundColor: labelTint(eventColor(event)), opacity: pressed ? 0.8 : 1 })}><Text variant="bodySm" numberOfLines={1} color="ink" style={{ flexShrink: 1 }}>{event.title}</Text>{range ? <Text variant="time" numberOfLines={1}>{range}</Text> : null}</Pressable>;
        })}</Stack>
      </View> : null}
      <ScrollView ref={scroll} testID="today-timeline" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing[3], paddingTop: theme.spacing[3], paddingBottom: theme.spacing[4] }}>
        <View style={{ height: (DAY_END - DAY_START) / 60 * HOUR, marginLeft: theme.layout.timeColumn }}>
          {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, index) => {
            const hour = DAY_START + index * 60;
            const hidden = nowShown && Math.abs(hour - nowMinutes) < NOW_LABEL_CLEARANCE;
            return <View key={index} style={{ position: 'absolute', top: at(hour), left: 0, right: 0, borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>{hidden ? null : <Text variant="time" style={{ position: 'absolute', left: -theme.layout.timeColumn, top: -theme.spacing[2] }}>{clock(hour)}</Text>}</View>;
          })}
          {timelineLanes(timed).map(({ event, lane, columns }) => {
            const start = Math.max(DAY_START, Math.min(DAY_END, minutes(event.startTime)));
            const end = Math.min(DAY_END, eventEnd(event));
            const available = overlapsTask(start, end) ? BESIDE_TASK : 100;
            const height = Math.max(theme.typography.time.lineHeight + theme.spacing[2], at(end) - at(start));
            return <TimelineEvent key={event.id} event={event} top={at(start)} height={height} left={`${lane * available / columns}%`} right={`${100 - (lane + 1) * available / columns}%`} onPress={() => onOpenEvent(event)} />;
          })}
          {scheduled.map(task => {
            const due = Math.max(DAY_START, Math.min(DAY_END - TASK_SPAN, minutes(task.dueDate!)));
            // Beside an event the marker keeps to the lane the events leave free; otherwise it is as wide as its title.
            const placement = overlapsEvent(due) ? { right: 0, width: `${100 - BESIDE_TASK}%` as const } : { left: 0, maxWidth: '100%' as const };
            return <TimelineTask key={task.id} task={task} top={at(due)} placement={placement} completion={taskCompletion(task)} onOpen={() => onOpenTask(task)} />;
          })}
          {nowShown ? <View pointerEvents="none" style={{ position: 'absolute', left: -theme.layout.timeColumn, right: 0, top: at(nowMinutes) - theme.typography.time.lineHeight / 2 }}><NowMarker time={clock(nowMinutes)} /></View> : null}
        </View>
      </ScrollView>
    </View>
    <View style={{ ...column, width: compact ? theme.layout.todayTodoWidth - theme.spacing[10] : theme.layout.todayTodoWidth }}>
      <PaneTitle>待办</PaneTitle>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={columnContent}>
        {groups.length ? groups.map(group => <View key={group.title}><GroupLabel tone={group.tone}>{`${group.title}（${group.tasks.length}）`}</GroupLabel><ListGroup>{group.tasks.map(renderTask)}</ListGroup></View>) : <Text variant="bodySm">今天没有待办。</Text>}
        {compact ? <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4], gap: theme.spacing[4] }}><Heading variant="section">接下来</Heading>{next}</View> : null}
      </ScrollView>
    </View>
    {!compact && !detailOpen ? <View style={{ ...column, width: theme.layout.todayUpcomingWidth }}>
      <PaneTitle>接下来</PaneTitle>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={columnContent}>{next}</ScrollView>
    </View> : null}
  </View>;
}
