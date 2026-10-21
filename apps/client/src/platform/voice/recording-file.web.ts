import type { VoiceAudioType } from './voice-recorder';

export const canOpenRecordingSettings = false;

/** Browsers grant the microphone only to secure origins (HTTPS or localhost). */
export function recordingAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof MediaRecorder !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Chrome and Firefox record WebM or Ogg Opus, Safari records MP4. Codec parameters are dropped. */
function audioType(type: string): VoiceAudioType {
  const base = type.split(';')[0]?.trim().toLowerCase();
  return base === 'audio/mp4' || base === 'audio/ogg' || base === 'audio/aac' || base === 'audio/mpeg' || base === 'audio/wav' ? base : 'audio/webm';
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Recording could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function readRecording(uri: string): Promise<{ data: string; mimeType: VoiceAudioType }> {
  try {
    const blob = await (await fetch(uri)).blob();
    return { data: await base64(blob), mimeType: audioType(blob.type) };
  } finally { discardRecording(uri); }
}

export function discardRecording(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
