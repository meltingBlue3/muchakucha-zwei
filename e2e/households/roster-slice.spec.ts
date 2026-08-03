import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `roster-slice-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  try {
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        email,
        displayName,
        password,
        platform: 'web',
      }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { email, accessToken };
  } finally {
    await database.end();
  }
}

async function createHousehold(
  accessToken: string,
  name: string,
): Promise<{ id: string; name: string; ownerMembershipId: string }> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();
  const household = body as { id: string; name: string; ownerMembershipId: string };
  expect(response.status).toBe(201);
  return { id: household.id, name: household.name, ownerMembershipId: household.ownerMembershipId };
}

// --- Static guard: this file must contain exactly one test() call. ---
// The verify automation counts test( occurrences; adding a second test() would
// break the gate. Keep integration and tie-case variants outside this dedicated
// RED file.

test('shows the isolated totally ordered roster [RED:HOUSEHOLD_ROSTER]', async ({ page, request }) => {
  test.setTimeout(120_000);

  // --- Precondition: auth is healthy ---
  const owner = await prepareVerifiedAccount('owner', '家主');
  expect(owner.accessToken).toBeDefined();

  // --- Precondition: database and household creation work ---
  const household = await createHousehold(owner.accessToken, '温暖小家');

  // --- Precondition: listMyHouseholds endpoint is healthy ---
  const listResponse = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
  });
  expect(listResponse.status()).toBe(200);
  const listBody = await listResponse.json();
  const items = listBody as Array<{ id: string; name: string; role: string }>;
  expect(items).toHaveLength(1);
  expect(items[0].id).toBe(household.id);
  expect(items[0].role).toBe('ADMIN');

  // --- Precondition: the /households selector route renders ---
  await page.goto('/households');
  await expect(page).toHaveURL(/\/households/);

  // === RED GATE ===
  // The owned household destination /households/[id], its getHousehold API
  // endpoint, and MemberRow/RoleBadge owned components do not exist yet.
  // This dedicated roster-slice test is RED until Task 2 implements the full
  // API-to-UI roster slice (controller/service/DTO/OpenAPI/client/route/components).
  throw new Error(
    'IMPLEMENTATION_MISSING_HOUSEHOLD_ROSTER: ' +
    'The GET /api/v1/households/:id (operationId getHousehold) guarded endpoint, ' +
    'the /households/[id] route, MemberRow and RoleBadge owned components, ' +
    'the extended household-api.ts wrapper, and cross-household isolation ' +
    'guards have not been created yet. Preconditions (auth, createHousehold, ' +
    'listMyHouseholds, /households selector) are healthy.',
  );
});
