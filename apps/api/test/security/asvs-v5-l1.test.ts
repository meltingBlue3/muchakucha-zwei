import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const asvsMapPath = 'docs/security/asvs-v5.0.0-l1.md';
const securityAssets = [asvsMapPath] as const;

const EXPECTED_ASVS_SOURCE_URL =
  'https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv';
const EXPECTED_ASVS_SOURCE_SHA256 = '98c8fe911b9edb403af8ee05d3ce8201ecac2659e313b053890a62847cdcf680';
// TODO: Phase 2 rows added — recalibrate SHA256 by running the ASVS audit test once
// the official CSV requirement text is pinned.
const EXPECTED_REQUIREMENTS_SHA256 = '14fdccac09d0c2276b41a7796cbf494aa60cc078766739a81a9ff7c150d86298';

const EXPECTED_IDS = [
  // Phase 1: account entry
  'v5.0.0-2.2.1',
  'v5.0.0-2.2.2',
  'v5.0.0-2.3.1',
  'v5.0.0-3.3.1',
  'v5.0.0-3.4.2',
  'v5.0.0-3.5.1',
  'v5.0.0-3.5.2',
  'v5.0.0-3.5.3',
  'v5.0.0-6.1.1',
  'v5.0.0-6.3.1',
  'v5.0.0-6.2.1',
  'v5.0.0-6.2.4',
  'v5.0.0-6.2.5',
  'v5.0.0-6.2.6',
  'v5.0.0-6.2.7',
  'v5.0.0-6.2.8',
  'v5.0.0-6.3.2',
  'v5.0.0-6.4.1',
  'v5.0.0-6.4.2',
  'v5.0.0-7.2.1',
  'v5.0.0-7.2.2',
  'v5.0.0-7.2.3',
  'v5.0.0-7.2.4',
  'v5.0.0-7.4.1',
  'v5.0.0-9.1.1',
  'v5.0.0-9.1.2',
  'v5.0.0-9.1.3',
  'v5.0.0-9.2.1',
  'v5.0.0-10.4.5',
  'v5.0.0-11.4.1',
  'v5.0.0-14.2.1',
  'v5.0.0-14.3.1',
  // Phase 2: household member collaboration
  'v5.0.0-8.2.1',
  'v5.0.0-8.2.2',
  'v5.0.0-8.3.1',
  'v5.0.0-15.3.1',
  // Phase 2 L2 defense-in-depth (labeled L2 in evidence doc)
  'v5.0.0-2.3.3',
  'v5.0.0-2.3.4',
  'v5.0.0-3.4.5',
  'v5.0.0-11.5.1',
] as const;

type AsvsRow = {
  id: string;
  level: string;
  applicability: string;
  requirement: string;
  testPath: string;
  assertion: string;
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function parseAsvsRows(markdown: string): AsvsRow[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\| v5\.0\.0-/.test(line))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replaceAll('\\|', '|'));
      expect(cells, `Malformed ASVS mapping row: ${line}`).toHaveLength(6);
      const [id, level, applicability, requirement, testPath, assertion] = cells as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      return {
        id,
        level,
        applicability,
        requirement,
        testPath: testPath.replaceAll('`', ''),
        assertion: assertion.replaceAll('`', ''),
      };
    });
}

describe('OWASP ASVS 5.0.0 L1 security evidence', () => {
  test('security contract assets are present', () => {
    const missing = securityAssets.filter((path) => !existsSync(resolve(repoRoot, path)));
    expect(missing, `IMPLEMENTATION_MISSING_SECURITY_CONTRACTS: ${missing.join(', ')}`).toEqual([]);
  });

  test('ASVS map contains every recognized applicable control exactly once with official text', () => {
    const markdown = readRepoFile(asvsMapPath);
    const rows = parseAsvsRows(markdown);
    const ids = rows.map(({ id }) => id);

    expect(markdown).toContain(EXPECTED_ASVS_SOURCE_URL);
    expect(markdown).toContain(EXPECTED_ASVS_SOURCE_SHA256);
    expect(rows).toHaveLength(EXPECTED_IDS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(EXPECTED_IDS));

    // Phase 1 rows are all L1/Applicable; Phase 2 includes L2 defense-in-depth and
    // one L1 NOT SATISFIED row. Validate that every row has a valid level and
    // applicability value.
    const validLevels = new Set(['L1', 'L2']);
    const validApplicability = new Set(['Applicable', 'Defense-in-depth', 'NOT SATISFIED', 'Not applicable']);
    for (const row of rows) {
      expect(validLevels.has(row.level), `${row.id}: level "${row.level}" is not L1 or L2`).toBe(true);
      expect(validApplicability.has(row.applicability), `${row.id}: applicability "${row.applicability}" is invalid`).toBe(true);
    }

    // L1 rows must have L1 level.
    const phase1Ids = EXPECTED_IDS.slice(0, 32);
    for (const id of phase1Ids) {
      const row = rows.find((r) => r.id === id);
      expect(row, `Phase 1 row missing: ${id}`).toBeDefined();
      expect(row!.level).toBe('L1');
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const normalizedRequirements = EXPECTED_IDS.map((id) => `${id}\t${byId.get(id)!.requirement}\n`).join('');
    expect(sha256(normalizedRequirements)).toBe(EXPECTED_REQUIREMENTS_SHA256);
  });

  test('every ASVS control names one assertion in an existing test path', () => {
    const rows = parseAsvsRows(readRepoFile(asvsMapPath));

    for (const row of rows) {
      const absoluteTestPath = resolve(repoRoot, row.testPath);
      expect(existsSync(absoluteTestPath), `${row.id} evidence path does not exist: ${row.testPath}`).toBe(true);
      expect(row.testPath).toMatch(/(?:\.test\.ts|\.spec\.ts)$/);
      expect(row.assertion.length, `${row.id} has no named assertion`).toBeGreaterThan(0);
      const testSource = readFileSync(absoluteTestPath, 'utf8');
      const occurrences = testSource.split(row.assertion).length - 1;
      expect(occurrences, `${row.id} assertion must occur exactly once in ${row.testPath}`).toBe(1);
    }
  });
});
