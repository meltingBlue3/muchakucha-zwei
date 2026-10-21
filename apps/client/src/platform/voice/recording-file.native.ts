import { File } from 'expo-file-system';
import type { VoiceAudioType } from './voice-recorder';

export const canOpenRecordingSettings = true;

export function recordingAvailable(): boolean { return true; }

/** Reads the cache file into memory and deletes it, so no recording outlives its upload. */
export async function readRecording(uri: string): Promise<{ data: string; mimeType: VoiceAudioType }> {
  try { return { data: await new File(uri).base64(), mimeType: 'audio/mp4' }; }
  finally { discardRecording(uri); }
}

export function discardRecording(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* The system clears the cache directory eventually. */ }
}
