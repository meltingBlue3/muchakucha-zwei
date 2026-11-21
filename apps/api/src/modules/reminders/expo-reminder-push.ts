import type { UpcomingReminderDto } from './dto/reminder.dto.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push';
const labels = {
  zh: { task: '任务到期提醒', event: '日程提醒' },
  ja: { task: 'タスクの期限', event: '予定のリマインダー' },
} as const;

export function reminderPushMessage(
  reminder: UpcomingReminderDto,
  device: { language: string; timeZone: string; token: string },
  expiresAt: number,
) {
  const language = device.language === 'ja' ? 'ja' : 'zh';
  const date = new Intl.DateTimeFormat(language, {
    timeZone: device.timeZone,
    month: 'numeric', day: 'numeric',
    ...(reminder.dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  }).format(new Date(reminder.at));
  const household = `/households/${reminder.householdId}`;
  const section = reminder.kind === 'task' ? 'tasks' : 'events';
  return {
    to: device.token,
    title: reminder.title,
    body: `${labels[language][reminder.kind]} · ${date}`,
    sound: 'default',
    priority: 'high',
    channelId: `${reminder.kind}-reminders`,
    expiration: Math.floor(expiresAt / 1_000),
    data: {
      reminderPush: true,
      url: reminder.itemId === null ? `${household}/today` : `${household}/${section}/${reminder.itemId}`,
    },
  };
}

type ExpoResult = { status: 'ok'; id?: string } | { status: 'error'; details?: { error?: string } };
type PushTicket = { receiptId: string } | 'invalid' | 'retry' | 'failed';

export class ExpoReminderPush {
  constructor(private readonly accessToken: string | undefined) {}

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${EXPO_PUSH_URL}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
  }

  async send(message: ReturnType<typeof reminderPushMessage>): Promise<PushTicket> {
    const response = await this.post('send', message);
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 429 || response.status >= 500 ? 'retry' : 'failed';
    }
    const { data } = await response.json() as { data?: ExpoResult };
    if (data?.status === 'ok' && typeof data.id === 'string' && data.id.length <= 100) return { receiptId: data.id };
    if (data?.status === 'error') {
      if (data.details?.error === 'DeviceNotRegistered') return 'invalid';
      if (data.details?.error === 'MessageRateExceeded') return 'retry';
    }
    return 'failed';
  }

  async receipts(ids: string[]): Promise<Record<string, ExpoResult | undefined>> {
    const response = await this.post('getReceipts', { ids });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Expo receipt request failed');
    }
    const { data } = await response.json() as { data?: Record<string, ExpoResult | undefined> };
    return data ?? {};
  }
}
