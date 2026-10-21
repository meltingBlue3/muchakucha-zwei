import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useVoiceRecorder } from '../../platform/voice/voice-recorder';
import { sessionApiClient } from '../auth/session-runtime';
import { assistantToken, transcriptionError } from './assistant-runtime';

const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_RECORDING_SECONDS = 60;
/** Shorter than this is a slip of the finger, not speech. */
const MIN_RECORDING_MS = 400;
const TRANSCRIPTION_TIMEOUT_MS = 30_000;

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
  const recorder = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const latest = useRef({ value, onChangeText });
  latest.current = { value, onChangeText };
  const attempt = useRef<Attempt | null>(null);

  const settle = useCallback((current: Attempt, message: string | null) => {
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
    if (!recording || recording.durationMs < MIN_RECORDING_MS) { settle(current, '没有录到声音，请再试一次。'); return; }
    const request = new AbortController();
    current.request = request;
    const timeout = setTimeout(() => request.abort(), TRANSCRIPTION_TIMEOUT_MS);
    try {
      const { text } = await sessionApiClient.transcribeAssistantAudio(await assistantToken(), householdId,
        { providerId, mimeType: recording.mimeType, audio: recording.data }, request.signal);
      if (attempt.current !== current) return;
      const merged = mergeVoiceText(latest.current.value, text);
      if (!text.trim()) settle(current, '没有听清，请再试一次。');
      // Never cut a recognized sentence short to fit; the user decides what to shorten.
      else if (merged.length > MAX_MESSAGE_LENGTH) settle(current, '加上识别出的文字会超过 8,000 字，请先删减草稿再试。');
      else {
        settle(current, null);
        latest.current.onChangeText(merged);
      }
    } catch (error) {
      if (attempt.current !== current) return;
      settle(current, request.signal.aborted ? '语音转写超时，请重试或继续打字。' : transcriptionError(error, '语音转写未能完成，请重试或继续打字。'));
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
        settle(current, !recorder.canOpenSettings ? '浏览器没有允许使用麦克风，请在网站设置中允许后重试。'
          : permission.canAskAgain ? '需要允许使用麦克风，才能语音输入。' : '麦克风权限已关闭，请在系统设置中允许后重试。');
        return;
      }
      await recorder.start();
      // Cancelled while the microphone was opening: close it again.
      if (attempt.current !== current) { void recorder.discard().catch(() => undefined); return; }
    } catch {
      settle(current, '无法打开麦克风，请检查是否被其他应用占用，或继续打字。');
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
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'background') return;
      // Leaving the app, or a phone call, ends the recording: keep what was said rather than losing it.
      if (attempt.current?.timer) void finish();
      else cancel();
    });
    return () => subscription.remove();
  }, [cancel, finish]);

  return {
    available: Boolean(recorder && providerId), phase, engaged: phase !== 'idle', notice, settings, elapsed,
    level: () => recorder?.level() ?? null,
    start() { void start(); },
    finish() { void finish(); },
    cancel,
    async openSettings() {
      try { await Linking.openSettings(); }
      catch { setNotice('无法打开系统设置，请手动在设置中允许麦克风。'); }
    },
  };
}

export type AssistantVoiceInput = ReturnType<typeof useAssistantVoiceInput>;
