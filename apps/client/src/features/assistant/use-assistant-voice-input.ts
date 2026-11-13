import { currentLanguage, useTranslation } from '../../i18n';
import type { Catalog } from '../../i18n/locales/zh';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useVoiceRecorder } from '../../platform/voice/voice-recorder';
import { sessionApiClient } from '../auth/session-runtime';
import { assistantToken, transcriptionErrorKey, type AssistantErrorKey } from './assistant-runtime';

const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_RECORDING_SECONDS = 60;
/** Shorter than this is a slip of the finger, not speech. */
const MIN_RECORDING_MS = 400;
const TRANSCRIPTION_TIMEOUT_MS = 30_000;

type VoiceNotice = AssistantErrorKey | `voice.${keyof Catalog['assistant']['voice']}`;

type Phase = 'idle' | 'starting' | 'recording' | 'transcribing';
/** One press of the microphone. Callbacks from an attempt that is no longer current change nothing. */
type Attempt = { timer?: ReturnType<typeof setInterval>; request?: AbortController; finishing?: boolean };

/** Voice text goes at the end of the draft, on its own line when the draft already has text. */
export function mergeVoiceText(draft: string, text: string): string {
  const spoken = text.trim();
  if (!spoken) return draft;
  return `${draft}${draft && !draft.endsWith('\n') ? '\n' : ''}${spoken}`;
}

/** Records a short message, sends it to the household's transcription configuration and appends the
 * text to the draft for review. Nothing is sent to the assistant until the user presses send. */
export function useAssistantVoiceInput({ householdId, providerId, value, onChangeText, blocked }: {
  householdId: string; providerId: string | null; value: string; onChangeText(value: string): void; blocked: boolean;
}) {
  const { t } = useTranslation('assistant');
  const recorder = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [settings, setSettings] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const latest = useRef({ value, onChangeText });
  latest.current = { value, onChangeText };
  const attempt = useRef<Attempt | null>(null);

  const settle = useCallback((current: Attempt, message: VoiceNotice | null) => {
    if (attempt.current !== current) return;
    attempt.current = null;
    clearInterval(current.timer);
    setPhase('idle');
    setNotice(message);
  }, []);

  const cancel = useCallback(() => {
    const current = attempt.current;
    if (!current) return;
    attempt.current = null;
    clearInterval(current.timer);
    current.request?.abort();
    void recorder?.discard().catch(() => undefined);
    setPhase('idle');
  }, [recorder]);

  const finish = useCallback(async () => {
    const current = attempt.current;
    if (!current || current.finishing || !current.timer || !recorder || !providerId) return;
    current.finishing = true;
    clearInterval(current.timer);
    setPhase('transcribing');
    const recording = await recorder.finish().catch(() => null);
    if (attempt.current !== current) return;
    if (!recording || recording.durationMs < MIN_RECORDING_MS) { settle(current, 'voice.noSound'); return; }
    const request = new AbortController();
    current.request = request;
    const timeout = setTimeout(() => request.abort(), TRANSCRIPTION_TIMEOUT_MS);
    try {
      const { text } = await sessionApiClient.transcribeAssistantAudio(await assistantToken(), householdId,
        { providerId, mimeType: recording.mimeType, audio: recording.data }, request.signal, currentLanguage());
      if (attempt.current !== current) return;
      const merged = mergeVoiceText(latest.current.value, text);
      if (!text.trim()) settle(current, 'voice.notUnderstood');
      // Never cut a recognized sentence short to fit; the user decides what to shorten.
      else if (merged.length > MAX_MESSAGE_LENGTH) settle(current, 'voice.tooLong');
      else {
        settle(current, null);
        latest.current.onChangeText(merged);
      }
    } catch (error) {
      if (attempt.current !== current) return;
      settle(current, request.signal.aborted ? 'voice.timedOut' : transcriptionErrorKey(error, 'voice.failed'));
    } finally { clearTimeout(timeout); }
  }, [householdId, providerId, recorder, settle]);

  const start = useCallback(async () => {
    if (blocked || attempt.current || !recorder || !providerId) return;
    Keyboard.dismiss();
    const current: Attempt = {};
    attempt.current = current;
    setNotice(null);
    setSettings(false);
    setElapsed(0);
    setPhase('starting');
    try {
      const permission = await recorder.requestPermission();
      if (attempt.current !== current) return;
      if (!permission.granted) {
        setSettings(recorder.canOpenSettings && !permission.canAskAgain);
        settle(current, !recorder.canOpenSettings ? 'voice.browserDenied'
          : permission.canAskAgain ? 'voice.permissionNeeded' : 'voice.systemDenied');
        return;
      }
      await recorder.start();
      // Cancelled while the microphone was opening: close it again.
      if (attempt.current !== current) { void recorder.discard().catch(() => undefined); return; }
    } catch {
      settle(current, 'voice.cannotOpen');
      return;
    }
    const startedAt = Date.now();
    setPhase('recording');
    current.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(Math.min(seconds, MAX_RECORDING_SECONDS));
      if (seconds >= MAX_RECORDING_SECONDS) void finish();
    }, 250);
  }, [blocked, finish, providerId, recorder, settle]);

  // Leaving the screen discards the recording; nothing reaches another screen's draft.
  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => { if (blocked) cancel(); }, [blocked, cancel]);
  // A notice is about the last attempt; editing the draft dismisses it.
  useEffect(() => { setNotice(null); setSettings(false); }, [value]);
  useEffect(() => {
    // Leaving the app, or a phone call, ends the recording: keep what was said rather than losing it.
    // Before recording starts this is ignored: Android reports the app as backgrounded while the
    // system permission dialog is open.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background' && attempt.current?.timer) void finish();
    });
    return () => subscription.remove();
  }, [finish]);

  return {
    available: Boolean(recorder && providerId), phase, engaged: phase !== 'idle', notice: notice === null ? null : t(notice), settings, elapsed,
    level: () => recorder?.level() ?? null,
    start() { void start(); },
    finish() { void finish(); },
    cancel,
    async openSettings() {
      try { await Linking.openSettings(); }
      catch { setNotice('voice.settingsFailed'); }
    },
  };
}

export type AssistantVoiceInput = ReturnType<typeof useAssistantVoiceInput>;
