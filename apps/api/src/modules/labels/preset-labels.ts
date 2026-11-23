export const LABEL_SYSTEM_KEYS = ['birthday'] as const;

export type LabelSystemKey = (typeof LABEL_SYSTEM_KEYS)[number];

export type LabelLanguage = 'zh' | 'ja';

export interface PresetLabelSpec {
  readonly systemKey: LabelSystemKey | null;
  readonly names: Readonly<Record<LabelLanguage, string>>;
  readonly color: string;
}

/**
 * Starter labels created with every new household. Only `birthday` carries a
 * system key so automatic birthday tagging survives renaming or recoloring;
 * all five are ordinary labels that owners and admins may edit or delete.
 */
export const PRESET_HOUSEHOLD_LABELS: readonly PresetLabelSpec[] = [
  { systemKey: 'birthday', names: { zh: '生日', ja: '誕生日' }, color: '#AD4067' },
  { systemKey: null, names: { zh: '家务', ja: '家事' }, color: '#2C716C' },
  { systemKey: null, names: { zh: '采买', ja: '買い物' }, color: '#C98A1B' },
  { systemKey: null, names: { zh: '健康', ja: '健康' }, color: '#4C7537' },
  { systemKey: null, names: { zh: '出行', ja: 'お出かけ' }, color: '#3B7DD8' },
];

/** Resolves the starter label language from the request's Accept-Language header, falling back to Chinese. */
export function presetLabelLanguage(header: string | undefined): LabelLanguage {
  return /^ja(?:-[a-z0-9]{1,8})*$/i.test(header?.trim() ?? '') ? 'ja' : 'zh';
}

/** Narrows a stored system key column value to the supported API enum, or null. */
export function labelSystemKey(value: string | null | undefined): LabelSystemKey | null {
  return value === 'birthday' ? 'birthday' : null;
}
