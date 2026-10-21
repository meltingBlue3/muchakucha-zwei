import type { VoiceAudioType } from './voice-recorder';

/** Where a finished recording lives until it is read into memory. Platforms without a recorder offer no voice input. */
export const canOpenRecordingSettings = false;

export function recordingAvailable(): boolean { return false; }

export async function readRecording(_uri: string): Promise<{ data: string; mimeType: VoiceAudioType }> {
  throw new Error('Recording is unavailable on this platform.');
}

export function discardRecording(_uri: string): void {}
