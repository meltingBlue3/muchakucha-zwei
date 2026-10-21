import { renderHook } from '@testing-library/react-native';
import { setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useVoiceRecorder } from '../voice-recorder';

const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(private readonly uri: string) {}
    get exists() { return mockFiles.has(this.uri); }
    async base64() { return mockFiles.get(this.uri)!; }
    delete() { mockFiles.delete(this.uri); }
  },
}));

const uri = 'file:///cache/recording-1.m4a';
function fakeRecorder() {
  const recorder = {
    uri: null as string | null,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => { recorder.uri = uri; mockFiles.set(uri, 'bTRh'); }),
    getStatus: jest.fn(() => ({ canRecord: true, isRecording: true, durationMillis: 2_400, mediaServicesDidReset: false, url: null, metering: -18 })),
  };
  return recorder;
}

async function setup() {
  const recorder = fakeRecorder();
  jest.mocked(useAudioRecorder).mockReturnValue(recorder as unknown as ReturnType<typeof useAudioRecorder>);
  return { recorder, voice: (await renderHook(() => useVoiceRecorder())).result.current! };
}

beforeEach(() => { mockFiles.clear(); });

test('records small mono AAC, returns it in memory and deletes the file', async () => {
  const { recorder, voice } = await setup();
  expect(jest.mocked(useAudioRecorder).mock.calls[0]?.[0]).toMatchObject({ sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: true });
  const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
  await voice.start();
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: true, playsInSilentMode: true });
  expect(recorder.record).toHaveBeenCalledTimes(1);
  expect(voice.level()).toBe(-18);
  now.mockReturnValue(12_400);
  await expect(voice.finish()).resolves.toEqual({ data: 'bTRh', mimeType: 'audio/mp4', durationMs: 2_400 });
  expect(mockFiles.has(uri)).toBe(false);
  // Playback leaves the earpiece once recording ends.
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
});

test('a recording the system cannot finalize yields nothing and leaves no file', async () => {
  const { recorder, voice } = await setup();
  recorder.stop.mockImplementationOnce(async () => { recorder.uri = uri; mockFiles.set(uri, 'partial'); throw new Error('stop failed'); });
  await voice.start();
  await expect(voice.finish()).resolves.toBeNull();
  expect(mockFiles.has(uri)).toBe(false);
});

test('discarding stops an open microphone once and deletes the recording; it is harmless when idle', async () => {
  const { recorder, voice } = await setup();
  await voice.discard();
  expect(recorder.stop).not.toHaveBeenCalled();
  await voice.start();
  await voice.discard();
  await voice.discard();
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(mockFiles.has(uri)).toBe(false);
});

test('a microphone that fails to open releases the audio session and reports the failure', async () => {
  const { recorder, voice } = await setup();
  recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error('busy'));
  await expect(voice.start()).rejects.toThrow('busy');
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
  await expect(voice.finish()).resolves.toBeNull();
});
