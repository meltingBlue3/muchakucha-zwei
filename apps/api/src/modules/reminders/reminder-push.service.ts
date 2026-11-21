import { BadRequestException, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { ReminderPushDevice } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { EXPO_TOKEN_PATTERN, FCM_TOKEN_PATTERN, type RegisterReminderPushDto, type ReminderPushStatusDto } from './dto/reminder-push.dto.js';
import type { UpcomingReminderDto } from './dto/reminder.dto.js';
import { ExpoReminderPush, reminderPushMessage } from './expo-reminder-push.js';
import type { FcmReminderPush } from './fcm-reminder-push.js';
import { assertTimeZone, RemindersService } from './reminders.service.js';

const TICK_MS = 15_000;
const SEND_WINDOW_MS = 2 * 60_000;
const RECEIPT_DELAY_MS = 15 * 60_000;
const DELIVERY_RETENTION_MS = 2 * 86_400_000;
const DEVICE_BATCH_SIZE = 20;

function activeSession(now: Date) {
  return {
    revokedAt: null,
    absoluteEndsAt: { gt: now },
    refreshTokens: { some: { consumedAt: null, expiresAt: { gt: now } } },
  };
}

@Injectable()
export class ReminderPushService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReminderPushService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly expo: ExpoReminderPush,
    private readonly enabled: boolean,
    private readonly testing: boolean,
    private readonly fcm: FcmReminderPush | undefined,
  ) {}

  async register(sessionId: string, input: RegisterReminderPushDto): Promise<ReminderPushStatusDto> {
    const timeZone = assertTimeZone(input.timeZone);
    const provider = input.provider ?? 'expo';
    const valid = provider === 'fcm' ? FCM_TOKEN_PATTERN.test(input.token) : input.token.length <= 128 && EXPO_TOKEN_PATTERN.test(input.token);
    if (!valid) throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details: [{ field: 'token', codes: ['invalid_push_token'] }],
    });
    if (!this.enabled || (provider === 'fcm' && this.fcm === undefined)) {
      await this.unregister(sessionId);
      return { active: false };
    }
    const values = { ...input, provider, timeZone };
    await this.prisma.$transaction(async tx => {
      // A token can move to a new sign-in. A different token gets a new row,
      // so a late receipt for the old token can't remove its replacement.
      await tx.reminderPushDevice.deleteMany({
        where: { OR: [{ sessionId, token: { not: input.token } }, { token: input.token, sessionId: { not: sessionId } }] },
      });
      await tx.reminderPushDevice.upsert({ where: { sessionId }, create: { sessionId, ...values }, update: values });
    });
    return { active: true };
  }

  async unregister(sessionId: string): Promise<void> {
    await this.prisma.reminderPushDevice.deleteMany({ where: { sessionId } });
  }

  onApplicationBootstrap(): void {
    if (!this.enabled || this.testing) return;
    const tick = () => {
      if (this.running !== undefined) return;
      this.running = this.dispatch().catch(() => { this.logger.warn('Reminder push dispatch failed'); })
        .finally(() => { this.running = undefined; });
    };
    tick();
    this.timer = setInterval(tick, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async dispatch(now = new Date()): Promise<void> {
    if (!this.enabled) return;
    const since = new Date(now.getTime() - SEND_WINDOW_MS);
    let cursor: string | undefined;
    for (;;) {
      const devices = await this.prisma.reminderPushDevice.findMany({
        where: { session: activeSession(now), ...(cursor === undefined ? {} : { id: { gt: cursor } }) },
        include: { session: { select: { userId: true } } },
        orderBy: { id: 'asc' },
        take: DEVICE_BATCH_SIZE,
      });
      if (devices.length === 0) break;
      const plans = new Map<string, ReturnType<RemindersService['due']>>();
      const results = await Promise.allSettled(devices.map(async device => {
        const key = `${device.session.userId}/${device.timeZone}`;
        let plan = plans.get(key);
        if (plan === undefined) {
          plan = this.reminders.due(device.session.userId, device.timeZone, since, now);
          plans.set(key, plan);
        }
        for (const reminder of (await plan).reminders) {
          const fireAt = new Date(reminder.fireAt);
          if (fireAt < device.createdAt || (reminder.alarm && device.localAlarms)) continue;
          await this.send(device, reminder, fireAt);
        }
      }));
      if (results.some(result => result.status === 'rejected')) this.logger.warn('Some reminder pushes could not be processed');
      cursor = devices.at(-1)?.id;
      if (devices.length < DEVICE_BATCH_SIZE) break;
    }
    await this.prisma.reminderPushDelivery.deleteMany({ where: { fireAt: { lt: new Date(now.getTime() - DELIVERY_RETENTION_MS) } } });
    await this.checkReceipts(now);
  }

  private async send(device: ReminderPushDevice, reminder: UpcomingReminderDto, fireAt: Date): Promise<void> {
    const provider = device.provider === 'fcm' ? this.fcm : this.expo;
    if (provider === undefined) return;
    const expiresAt = fireAt.getTime() + SEND_WINDOW_MS;
    if (Date.now() >= expiresAt) return;
    const current = await this.prisma.reminderPushDevice.findFirst({
      where: { id: device.id, timeZone: device.timeZone, localAlarms: device.localAlarms, session: activeSession(new Date()) },
      select: { language: true },
    });
    if (current === null) return;
    const key = { deviceId: device.id, reminderKey: reminder.key, fireAt };
    const claim = await this.prisma.reminderPushDelivery.createMany({ data: key, skipDuplicates: true });
    if (claim.count === 0) return;

    // Retry an explicit transient rejection while it is still due. A transport
    // failure leaves the claim in place because the provider might have accepted it.
    const result = await provider.send(reminderPushMessage(reminder, { ...device, language: current.language }, expiresAt), expiresAt);
    if (typeof result === 'object') {
      await this.prisma.reminderPushDelivery.updateMany({
        where: key,
        data: { receiptId: result.receiptId, receiptAt: new Date(Date.now() + RECEIPT_DELAY_MS) },
      });
    } else if (result === 'invalid') {
      await this.prisma.reminderPushDevice.deleteMany({ where: { id: device.id } });
    } else if (result === 'retry') {
      await this.prisma.reminderPushDelivery.deleteMany({ where: key });
    } else if (result === 'failed') {
      this.logger.warn(`${device.provider} rejected a reminder push`);
    }
  }

  private async checkReceipts(now: Date): Promise<void> {
    const pending = await this.prisma.reminderPushDelivery.findMany({
      where: { receiptAt: { lte: now } },
      orderBy: { receiptAt: 'asc' },
      take: 100,
    });
    const ids = pending.flatMap(delivery => delivery.receiptId === null ? [] : [delivery.receiptId]);
    if (ids.length === 0) return;
    const receipts = await this.expo.receipts(ids);
    for (const { deviceId, reminderKey, fireAt, receiptId } of pending) {
      if (receiptId === null) continue;
      const receipt = Object.hasOwn(receipts, receiptId) ? receipts[receiptId] : undefined;
      if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        await this.prisma.reminderPushDevice.deleteMany({ where: { id: deviceId } });
        continue;
      }
      if (receipt?.status === 'error') this.logger.warn('A push provider rejected a reminder');
      await this.prisma.reminderPushDelivery.updateMany({
        where: { deviceId, reminderKey, fireAt },
        data: { receiptAt: receipt === undefined ? new Date(now.getTime() + 60_000) : null },
      });
    }
  }
}
