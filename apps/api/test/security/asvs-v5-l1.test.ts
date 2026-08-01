import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const denylistPath = 'apps/api/src/modules/auth/data/common-passwords-top-3000.txt';
const provenancePath = 'apps/api/src/modules/auth/data/common-passwords-SOURCE.md';
const asvsMapPath = 'docs/security/asvs-v5.0.0-l1.md';
const securityAssets = [denylistPath, provenancePath, asvsMapPath] as const;

const EXPECTED_SOURCE_URL =
  'https://raw.githubusercontent.com/danielmiessler/SecLists/190c6f7bd58c847ceadfe57d9853592737f059e8/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt';
const EXPECTED_SOURCE_SHA256 = '424a3e03a17df0a2bc2b3ca749d81b04e79d59cb7aeec8876a5a3f308d0caf51';
const EXPECTED_DERIVED_SHA256 = 'e556819f94c009a90b38eab1051dae4c222ff7148330b4e2b395932465b214ea';
const EXPECTED_ASVS_SOURCE_URL =
  'https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv';
const EXPECTED_ASVS_SOURCE_SHA256 = '98c8fe911b9edb403af8ee05d3ce8201ecac2659e313b053890a62847cdcf680';
const EXPECTED_REQUIREMENTS_SHA256 = '8341cdb2a6ab394fea73792e1f28be779fd9c1f3c5045adac3f7b65343db8e24';

const EXPECTED_IDS = [
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

function metadataValue(markdown: string, label: string): string {
  const prefix = `- **${label}:** `;
  const line = markdown.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  expect(line, `Missing provenance field: ${label}`).toBeDefined();
  return line!.slice(prefix.length).replace(/^`|`$/g, '');
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

  test('runtime common-password data is the exact licensed deterministic top-3000 derivation', () => {
    const denylist = readRepoFile(denylistPath);
    const provenance = readRepoFile(provenancePath);
    const entries = denylist.endsWith('\n') ? denylist.slice(0, -1).split('\n') : denylist.split('\n');

    expect(denylist).not.toContain('\r');
    expect(entries).toHaveLength(3000);
    expect(new Set(entries).size).toBe(entries.length);
    expect(entries.every((entry) => [...entry].length >= 12 && [...entry].length <= 128)).toBe(true);
    expect(sha256(Buffer.from(denylist, 'utf8'))).toBe(EXPECTED_DERIVED_SHA256);

    expect(metadataValue(provenance, 'Upstream URL')).toBe(EXPECTED_SOURCE_URL);
    expect(metadataValue(provenance, 'Upstream SHA-256')).toBe(EXPECTED_SOURCE_SHA256);
    expect(metadataValue(provenance, 'Derived SHA-256')).toBe(EXPECTED_DERIVED_SHA256);
    expect(metadataValue(provenance, 'License')).toBe('MIT');
    expect(metadataValue(provenance, 'Retrieved')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(provenance).toContain('preserve source order');
    expect(provenance).toContain('12 through 128 Unicode code points');
    expect(provenance).toContain('first 3000 unique entries');
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
    expect(rows.every(({ level }) => level === 'L1')).toBe(true);
    expect(rows.every(({ applicability }) => applicability === 'Applicable')).toBe(true);

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
