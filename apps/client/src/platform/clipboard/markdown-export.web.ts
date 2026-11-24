export const markdownExportKind: 'copy' | 'share' = 'copy';

/** Copies the text; browsers allow it from the click that asked. */
export async function exportMarkdown(text: string): Promise<'done' | 'failed'> {
  try {
    await navigator.clipboard.writeText(text);
    return 'done';
  } catch {
    return 'failed';
  }
}
