import { useMemo } from 'react';
import {
  AudioQuality, IOSOutputFormat, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { canOpenRecordingSettings, discardRecording, readRecording, recordingAvailable } from './recording-file';

/** The formats the transcription endpoint accepts. */
export type VoiceAudioType = 'audio/mp4' | 'audio/aac' | 'audio/webm' | 'audio/ogg' | 'audio/wav' | 'audio/mpeg';
export type VoiceRecording = { data: string; mimeType: VoiceAudioType; durationMs: number };
export type VoicePermission = { granted: boolean; canAskAgain: boolean };

export type VoiceRecorder = {
  /** Whether the app can send the user to the system settings that grant the microphone. */
  canOpenSettings: boolean;
  /** Asks only when the user has started voice input, never on load. */
  requestPermission(): Promise<VoicePermission>;
  /** Opens the microphone and starts recording. */
  start(): Promise<void>;
  /** Stops and returns the recording as base64 in memory; its file is deleted. Null when nothing was captured. */
  finish(): Promise<VoiceRecording | null>;
  /** Stops and deletes the recording. Safe to call in any state. */
  discard(): Promise<void>;
  /** The input level in dBFS while recording, or null where metering is unavailable. */
  level(): number | null;
};

// Speech needs little bandwidth: 16 kHz mono AAC at 32 kbit/s keeps a minute near 240 KB,
// far below the upload limit. Browsers choose their own sample rate and fall back from WebM to MP4.
const options: RecordingOptions = {
  extension: '.m4a', sampleRate: 16_000, numberOfChannels: 1, bitRate: 32_000, isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  // No bitsPerSecond: browsers split that between audio and video. The shared bitRate becomes audioBitsPerSecond.
  web: { mimeType: 'audio/webm' },
};

/** Null where this platform cannot record, such as a browser on a plain-HTTP origin. */
export function useVoiceRecorder(): VoiceRecorder | null {
  const recorder = useAudioRecorder(options);
  return useMemo(() => {
    if (!recordingAvailable()) return null;
    let recording = false;
    // Measured here rather than read from the recorder: browsers report it only after MediaRecorder's start event.
    let startedAt = 0;
    // iOS routes playback to the earpiece while recording is allowed, so it is allowed only while recording.
    const release = () => setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    const stop = async (): Promise<boolean> => {
      if (!recording) return false;
      recording = false;
      try { await recorder.stop(); return true; }
      // Android cannot finalize a recording stopped within a fraction of a second.
      catch { return false; }
      finally { await release(); }
    };
    return {
      canOpenSettings: canOpenRecordingSettings,
      async requestPermission() {
        // Asking on Android opens the system permission screen even when already granted, which pauses the app.
        const current = await getRecordingPermissionsAsync();
        const permission = current.granted ? current : await requestRecordingPermissionsAsync();
        return { granted: permission.granted, canAskAgain: permission.canAskAgain };
      },
      async start() {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        try {
          await recorder.prepareToRecordAsync();
          recorder.record();
          startedAt = Date.now();
          recording = true;
        } catch (error) {
          await release();
          throw error;
        }
      },
      async finish() {
        const durationMs = Date.now() - startedAt;
        const stopped = await stop();
        const uri = recorder.uri;
        if (!stopped || !uri) {
          if (uri) discardRecording(uri);
          return null;
        }
        return { ...await readRecording(uri), durationMs };
      },
      async discard() {
        await stop();
        if (recorder.uri) discardRecording(recorder.uri);
      },
      level() {
        const metering = recorder.getStatus().metering;
        return typeof metering === 'number' && Number.isFinite(metering) ? metering : null;
      },
    };
  }, [recorder]);
}
