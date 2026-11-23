import { describe, expect, test } from 'vitest';
import {
  PRESET_HOUSEHOLD_LABELS,
  labelSystemKey,
  presetLabelLanguage,
} from './preset-labels.js';

describe('preset household labels', () => {
  test('resolves starter label language from Accept-Language', () => {
    expect(presetLabelLanguage(undefined)).toBe('zh');
    expect(presetLabelLanguage('zh')).toBe('zh');
    expect(presetLabelLanguage('zh-CN')).toBe('zh');
    expect(presetLabelLanguage('ja')).toBe('ja');
    expect(presetLabelLanguage('ja-JP')).toBe('ja');
    expect(presetLabelLanguage('en-US')).toBe('zh');
  });

  test('defines five unique non-vermilion starter labels with one birthday system key', () => {
    expect(PRESET_HOUSEHOLD_LABELS).toHaveLength(5);
    expect(new Set(PRESET_HOUSEHOLD_LABELS.map((item) => item.names.zh)).size).toBe(5);
    expect(new Set(PRESET_HOUSEHOLD_LABELS.map((item) => item.names.ja)).size).toBe(5);

    for (const item of PRESET_HOUSEHOLD_LABELS) {
      expect(item.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(item.color).not.toBe('#C2381C');
    }

    const birthdayEntries = PRESET_HOUSEHOLD_LABELS.filter((item) => item.systemKey !== null);
    expect(birthdayEntries).toHaveLength(1);
    expect(birthdayEntries[0]?.systemKey).toBe('birthday');
  });

  test('narrows stored systemKey values safely', () => {
    expect(labelSystemKey('birthday')).toBe('birthday');
    expect(labelSystemKey(null)).toBeNull();
    expect(labelSystemKey(undefined)).toBeNull();
    expect(labelSystemKey('other')).toBeNull();
  });
});
