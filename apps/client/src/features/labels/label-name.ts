import type { LabelNamesDto } from '@muchakucha/api-client';

import { currentLanguage } from '../../i18n';

/**
 * What a label is called on this device. A starter label that keeps its
 * default name reads in the interface language; any other label, or a server
 * that does not send `localizedNames`, goes by `name`.
 */
export function labelName(label: { name: string; localizedNames?: LabelNamesDto | null }): string {
  return label.localizedNames?.[currentLanguage()] ?? label.name;
}
