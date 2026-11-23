import { describe, expect, test } from 'vitest';
import { LABEL_SYSTEM_KEYS, STARTER_LABELS, isDefaultName, labelResponse, starterLabel, type LabelRow } from './starter-labels.js';

const row = (overrides: Partial<LabelRow>): LabelRow => ({
  id: 'label-1',
  householdId: 'household-1',
  name: null,
  color: '#AD4067',
  systemKey: 'birthday',
  createdBy: 'user-1',
  createdAt: new Date('2026-11-24T00:00:00.000Z'),
  ...overrides,
});

describe('starter labels', () => {
  test('five starters, each default name belonging to one starter only, none in the accent vermilion', () => {
    expect(LABEL_SYSTEM_KEYS).toEqual(['birthday', 'chores', 'shopping', 'health', 'outings']);
    const owners = new Map<string, string>();
    for (const starter of STARTER_LABELS) {
      for (const name of Object.values(starter.names)) {
        expect(owners.get(name) ?? starter.systemKey).toBe(starter.systemKey);
        owners.set(name, starter.systemKey);
      }
      expect(starter.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(starter.color).not.toBe('#C2381C');
    }
  });

  test('a default name is one of the starter\'s own, in any language', () => {
    const birthday = starterLabel('birthday')!;
    expect(isDefaultName(birthday, '生日')).toBe(true);
    expect(isDefaultName(birthday, '誕生日')).toBe(true);
    expect(isDefaultName(birthday, '家务')).toBe(false);
    expect(starterLabel('unknown')).toBeUndefined();
    expect(starterLabel(null)).toBeUndefined();
  });
});

describe('a label as the API reports it', () => {
  test('a starter that keeps its default name carries it in every language, and Chinese as its name', () => {
    expect(labelResponse(row({}))).toEqual({
      id: 'label-1', householdId: 'household-1', name: '生日', color: '#AD4067', systemKey: 'birthday',
      localizedNames: { zh: '生日', ja: '誕生日' }, createdBy: 'user-1', createdAt: '2026-11-24T00:00:00.000Z',
    });
  });

  test('a renamed starter keeps its key but reads the same everywhere', () => {
    expect(labelResponse(row({ name: '纪念日' }))).toMatchObject({ name: '纪念日', systemKey: 'birthday', localizedNames: null });
  });

  test('a label someone created has neither', () => {
    expect(labelResponse(row({ name: '学校', systemKey: null }))).toMatchObject({ name: '学校', systemKey: null, localizedNames: null });
  });
});
