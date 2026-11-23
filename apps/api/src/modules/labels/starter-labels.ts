import type { LabelNamesDto, LabelResponseDto } from './dto/create-label.dto.js';

/**
 * Labels every household starts with. Until someone renames one, it has no
 * name of its own and goes by its default name, which each reader sees in
 * their own interface language. New birthdays are tagged with `birthday`.
 * Owners and admins may rename, recolour or delete any of them; a deleted one
 * is not brought back.
 */
export const STARTER_LABELS = [
  { systemKey: 'birthday', names: { zh: '生日', ja: '誕生日' }, color: '#AD4067' },
  { systemKey: 'chores', names: { zh: '家务', ja: '家事' }, color: '#2C716C' },
  { systemKey: 'shopping', names: { zh: '采买', ja: '買い物' }, color: '#C98A1B' },
  { systemKey: 'health', names: { zh: '健康', ja: '健康' }, color: '#4C7537' },
  { systemKey: 'outings', names: { zh: '出行', ja: 'お出かけ' }, color: '#3B7DD8' },
] as const satisfies ReadonlyArray<{ systemKey: string; names: LabelNamesDto; color: string }>;

export type LabelSystemKey = (typeof STARTER_LABELS)[number]['systemKey'];
export type StarterLabel = (typeof STARTER_LABELS)[number];

export const LABEL_SYSTEM_KEYS: readonly LabelSystemKey[] = STARTER_LABELS.map((starter) => starter.systemKey);

/** A `labels` row as Prisma reads it. */
export interface LabelRow {
  id: string;
  householdId: string;
  name: string | null;
  color: string;
  systemKey: string | null;
  createdBy: string;
  createdAt: Date;
}

/** The starter label a stored system key names, if it is one. */
export function starterLabel(systemKey: string | null): StarterLabel | undefined {
  return STARTER_LABELS.find((starter) => starter.systemKey === systemKey);
}

/** Whether `name` is one of the starter's default names, in any language. */
export function isDefaultName(starter: StarterLabel, name: string): boolean {
  return Object.values(starter.names).some((defaultName) => defaultName === name);
}

/**
 * The name the API reports: the label's own, or for a starter that keeps its
 * default name, the Chinese one. Apps that predate `localizedNames` show it,
 * and edits send it back as `expectedName`.
 */
export function labelName(row: Pick<LabelRow, 'name' | 'systemKey'>): string {
  return row.name ?? starterLabel(row.systemKey)?.names.zh ?? '';
}

export function labelResponse(row: LabelRow): LabelResponseDto {
  const starter = starterLabel(row.systemKey);
  return {
    id: row.id,
    householdId: row.householdId,
    name: labelName(row),
    color: row.color,
    systemKey: starter?.systemKey ?? null,
    localizedNames: row.name === null && starter !== undefined ? { ...starter.names } : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}
