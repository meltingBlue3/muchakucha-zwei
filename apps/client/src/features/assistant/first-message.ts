/**
 * A message typed on the assistant home, handed to the conversation created for it. It stays in
 * memory only: message text never enters navigation parameters or persistent storage.
 */
const queued = new Map<string, string>();

export function queueFirstMessage(conversationId: string, message: string): void {
  queued.set(conversationId, message);
}

export function takeFirstMessage(conversationId: string): string | undefined {
  const message = queued.get(conversationId);
  queued.delete(conversationId);
  return message;
}
