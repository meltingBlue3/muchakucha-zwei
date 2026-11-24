import { Share } from 'react-native';

/**
 * How a note leaves the app as Markdown on this platform. The app has no
 * native clipboard module, so phones use the system share sheet, whose
 * choices include copying.
 */
export const markdownExportKind: 'copy' | 'share' = 'share';

export async function exportMarkdown(text: string): Promise<'done' | 'failed'> {
  try {
    await Share.share({ message: text });
    return 'done';
  } catch {
    return 'failed';
  }
}
