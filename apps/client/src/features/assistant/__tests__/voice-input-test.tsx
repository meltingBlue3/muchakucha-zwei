import { useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ApiClientError, type AssistantConversationResponseDto } from '@muchakucha/api-client';
import { useVoiceRecorder, type VoicePermission, type VoiceRecorder, type VoiceRecording } from '../../../platform/voice/voice-recorder';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { sessionApiClient } from '../../auth/session-runtime';
import { AssistantComposer } from '../assistant-composer';
import { AssistantConversationPanel } from '../conversation-panel';
import { useAssistantVoiceInput } from '../use-assistant-voice-input';

let mockFocused = true;
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void | (() => void)) => {
  const React = jest.requireActual<typeof import('react')>('react');
  React.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused]);
} }));
jest.mock('../../../platform/voice/voice-recorder', () => ({ useVoiceRecorder: jest.fn() }));
jest.mock('../../auth/session-runtime', () => ({
  sessionTransport: { getAccessToken: jest.fn(async () => 'token') },
  sessionApiClient: { transcribeAssistantAudio: jest.fn() },
}));

const recording: VoiceRecording = { data: 'bTRhLWF1ZGlv', mimeType: 'audio/mp4', durationMs: 3_200 };
let recorder: { [K in keyof VoiceRecorder]: VoiceRecorder[K] extends (...args: infer A) => infer R ? jest.Mock<R, A> : VoiceRecorder[K] };
let changeAppState: (state: AppStateStatus) => void;
const transcribe = () => jest.mocked(sessionApiClient.transcribeAssistantAudio);

function Composer({ initial = '', blocked = false, providerId = 'asr', send = jest.fn() }: { initial?: string; blocked?: boolean; providerId?: string | null; send?: () => void }) {
  const [value, onChangeText] = useState(initial);
  const voice = useAssistantVoiceInput({ householdId: 'home', providerId, value, onChangeText, blocked });
  return <MuchakuchaThemeProvider><AssistantComposer value={value} onChangeText={onChangeText} onSend={send} blocked={blocked} busy={false} voice={voice} /></MuchakuchaThemeProvider>;
}

type View = Awaited<ReturnType<typeof render>>;
const draft = (view: View) => view.getByLabelText('发送给助手');
async function record(view: View) {
  await fireEvent.press(view.getByRole('button', { name: '语音输入' }));
  await view.findByText('正在录音');
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  recorder = {
    canOpenSettings: true,
    requestPermission: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    start: jest.fn(async () => undefined),
    finish: jest.fn(async () => recording),
    discard: jest.fn(async () => undefined),
    level: jest.fn(() => -20),
  };
  jest.mocked(useVoiceRecorder).mockReturnValue(recorder);
  transcribe().mockResolvedValue({ text: '明天下午3点接孩子。' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changeAppState = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => { jest.useRealTimers(); });

test('records, transcribes with the household configuration and appends the text for review without sending', async () => {
  const send = jest.fn();
  const view = await render(<Composer initial="请帮我安排" send={send} />);
  expect(recorder.requestPermission).not.toHaveBeenCalled();
  await record(view);
  expect(draft(view)).toHaveProp('editable', false);
  expect(view.queryByRole('button', { name: '发送' })).toBeNull();
  await act(() => jest.advanceTimersByTime(3_000));
  expect(view.getByText('0:03')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  expect(transcribe()).toHaveBeenCalledWith('token', 'home', { providerId: 'asr', mimeType: 'audio/mp4', audio: 'bTRhLWF1ZGlv' }, expect.any(AbortSignal));
  expect(draft(view)).toHaveProp('value', '请帮我安排\n明天下午3点接孩子。');
  expect(draft(view)).toHaveProp('editable', true);
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '发送' }));
  expect(send).toHaveBeenCalledTimes(1);
});

test('without a transcription configuration or a recorder there is no microphone', async () => {
  const view = await render(<Composer providerId={null} initial="可以打字" />);
  expect(view.queryByRole('button', { name: '语音输入' })).toBeNull();
  jest.mocked(useVoiceRecorder).mockReturnValue(null);
  await view.rerender(<Composer initial="可以打字" />);
  expect(view.queryByRole('button', { name: '语音输入' })).toBeNull();
  expect(view.getByRole('button', { name: '发送' })).toBeEnabled();
});

test('cancel discards the recording; a result arriving after cancel changes nothing', async () => {
  const view = await render(<Composer initial="原文" />);
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '取消语音输入' }));
  expect(recorder.discard).toHaveBeenCalledTimes(1);
  expect(recorder.finish).not.toHaveBeenCalled();
  expect(transcribe()).not.toHaveBeenCalled();

  let reply!: (value: { text: string }) => void;
  transcribe().mockImplementationOnce((_token, _household, _body, signal) => new Promise(resolve => { reply = resolve; expect(signal).toBeDefined(); }));
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  expect(view.getByText('正在转写…')).toBeTruthy();
  const signal = transcribe().mock.calls[0]![3]!;
  await fireEvent.press(view.getByRole('button', { name: '取消语音输入' }));
  expect(signal.aborted).toBe(true);
  await act(async () => reply({ text: '迟到的文字' }));
  expect(draft(view)).toHaveProp('value', '原文');
});

test('a minute of recording finishes by itself', async () => {
  const view = await render(<Composer />);
  await record(view);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(recorder.finish).toHaveBeenCalledTimes(1);
  expect(draft(view)).toHaveProp('value', '明天下午3点接孩子。');
});

test.each<[string, VoicePermission, boolean, string, boolean]>([
  ['a first refusal', { granted: false, canAskAgain: true }, true, '需要允许使用麦克风，才能语音输入。', false],
  ['a permanent refusal', { granted: false, canAskAgain: false }, true, '麦克风权限已关闭，请在系统设置中允许后重试。', true],
  ['a browser refusal', { granted: false, canAskAgain: false }, false, '浏览器没有允许使用麦克风，请在网站设置中允许后重试。', false],
])('%s explains the next step and keeps the draft', async (_case, permission, canOpenSettings, message, settings) => {
  recorder.requestPermission.mockResolvedValueOnce(permission);
  recorder.canOpenSettings = canOpenSettings;
  const view = await render(<Composer initial="原文" />);
  await fireEvent.press(view.getByRole('button', { name: '语音输入' }));
  expect(await view.findByText(message)).toBeTruthy();
  expect(view.queryByRole('button', { name: '打开设置' }) !== null).toBe(settings);
  expect(recorder.start).not.toHaveBeenCalled();
  expect(draft(view)).toHaveProp('value', '原文');
  // Editing the draft dismisses the notice.
  await fireEvent.changeText(draft(view), '原文，继续写');
  expect(view.queryByText(message)).toBeNull();
});

test.each<[string, () => void, string]>([
  ['silence', () => transcribe().mockResolvedValueOnce({ text: '  ' }), '没有听清，请再试一次。'],
  ['a slip of the finger', () => recorder.finish.mockResolvedValueOnce({ ...recording, durationMs: 200 }), '没有录到声音，请再试一次。'],
  ['a rejected key', () => transcribe().mockRejectedValueOnce(new ApiClientError(502, { error: { code: 'ASSISTANT_PROVIDER_AUTH_FAILED' } })), '模型服务拒绝了 API 密钥，请检查或更新密钥。'],
])('%s leaves the draft unchanged and says why', async (_case, arrange, message) => {
  arrange();
  const view = await render(<Composer initial="原文" />);
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  expect(await view.findByText(message)).toBeTruthy();
  expect(draft(view)).toHaveProp('value', '原文');
});

test('a transcription that never answers times out instead of spinning', async () => {
  transcribe().mockImplementationOnce((_token, _household, _body, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const view = await render(<Composer initial="原文" />);
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.getByText('语音转写超时，请重试或继续打字。')).toBeTruthy();
  expect(draft(view)).toHaveProp('editable', true);
});

test('text that would push the draft past 8,000 characters is not cut short or merged', async () => {
  const long = '字'.repeat(7_995);
  const view = await render(<Composer initial={long} />);
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  expect(await view.findByText('加上识别出的文字会超过 8,000 字，请先删减草稿再试。')).toBeTruthy();
  expect(draft(view)).toHaveProp('value', long);
});

test('leaving the app keeps what was said; leaving the screen or losing write access discards it', async () => {
  const view = await render(<Composer initial="原文" />);
  await record(view);
  await act(async () => changeAppState('background'));
  expect(recorder.finish).toHaveBeenCalledTimes(1);
  expect(draft(view)).toHaveProp('value', '原文\n明天下午3点接孩子。');

  await record(view);
  mockFocused = false;
  await view.rerender(<Composer initial="原文" />);
  expect(recorder.discard).toHaveBeenCalledTimes(1);

  mockFocused = true;
  await view.rerender(<Composer initial="原文" />);
  await record(view);
  await view.rerender(<Composer initial="原文" blocked />);
  expect(recorder.discard).toHaveBeenCalledTimes(2);
  expect(transcribe()).toHaveBeenCalledTimes(1);
});

test('cancelling while the microphone opens closes it again once it is open', async () => {
  let opened!: () => void;
  recorder.start.mockImplementationOnce(() => new Promise<void>(resolve => { opened = resolve; }));
  const view = await render(<Composer />);
  await fireEvent.press(view.getByRole('button', { name: '语音输入' }));
  expect(view.getByText('正在打开麦克风…')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '取消语音输入' }));
  await act(async () => opened());
  expect(recorder.discard).toHaveBeenCalledTimes(2);
  expect(view.queryByText('正在录音')).toBeNull();
});

test('in a conversation, voice text is sent only by the send button and pending actions disable the microphone', async () => {
  const conversation: AssistantConversationResponseDto = { id: 'chat', title: '家庭安排', providerId: 'provider', version: 1, state: 'idle', messages: [], pendingActions: [], updatedAt: '2026-10-04T00:00:00.000Z' };
  const send = jest.fn().mockResolvedValue(true);
  const panel = (pending: boolean) => <MuchakuchaThemeProvider><AssistantConversationPanel conversation={{ ...conversation, pendingActions: pending ? [{ id: 'call', name: 'create_task', arguments: {} }] : [] }}
    busy={false} disabled={false} onSend={send} voiceInput={{ householdId: 'home', providerId: 'asr' }} /></MuchakuchaThemeProvider>;
  const view = await render(panel(false));
  await record(view);
  await fireEvent.press(view.getByRole('button', { name: '完成录音' }));
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '发送' }));
  expect(send).toHaveBeenCalledWith('明天下午3点接孩子。');
  await view.rerender(panel(true));
  expect(view.getByRole('button', { name: '语音输入' })).toBeDisabled();
});
