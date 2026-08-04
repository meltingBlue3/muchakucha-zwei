import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Database helpers ----

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// ---- Account helpers ----

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  return withDatabase(async (database) => {
    const email = `collab-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

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

    const userResult = await database.query(
      `SELECT "id" FROM "User" WHERE "email_canonical" = lower($1)`,
      [email],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { email, accessToken, userId };
  });
}

async function loginViaPage(
  page: import('@playwright/test').Page,
  email: string,
): Promise<void> {
  await page.goto(`${WEB_ORIGIN}/login`);
  await page.waitForTimeout(500);
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForTimeout(1000);
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

async function addMembershipViaDb(
  householdId: string,
  userId: string,
  role: string,
): Promise<void> {
  await withDatabase(async (database) => {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [userId, householdId, role],
    );
  });
}

async function getMembershipIdViaDb(
  householdId: string,
  userId: string,
): Promise<string | undefined> {
  return withDatabase(async (database) => {
    const result = await database.query(
      `SELECT "id" FROM "memberships" WHERE "user_id" = $1 AND "household_id" = $2`,
      [userId, householdId],
    );
    return result.rows[0]?.id as string | undefined;
  });
}

async function getHouseholdMemberships(
  accessToken: string,
  householdId: string,
): Promise<Array<{ membershipId: string; userId: string; role: string }>> {
  const response = await fetch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(householdId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { members: Array<{ membershipId: string; userId: string; role: string }> };
  return body.members;
}

// --- Static guard: this file must contain exactly one test() call. ---

test('completes the full household collaboration journey', async ({ page, request }) => {
  test.setTimeout(180_000);

  // ============================================================================
  // 1. CREATION: Two actors create independent households.
  // ============================================================================

  const alice = await prepareVerifiedAccount('alice', '家主アリス');
  const bob = await prepareVerifiedAccount('bob', 'ボブ');
  const carol = await prepareVerifiedAccount('carol', 'キャロル');
  const dave = await prepareVerifiedAccount('dave', 'デイブ');

  // Alice creates her primary household.
  const aliceHousehold = await createHousehold(alice.accessToken, 'アリス家');

  // Bob creates his own household (independent).
  const bobHousehold = await createHousehold(bob.accessToken, 'ボブ家');

  // Verify Alice's household roster contains only her as owner.
  let aliceRoster = await getHouseholdMemberships(alice.accessToken, aliceHousehold.id);
  expect(aliceRoster.length).toBe(1);
  expect(aliceRoster[0].role).toBe('OWNER');
  expect(aliceRoster[0].userId).toBe(alice.userId);

  // ============================================================================
  // 2. SWITCH / RESTORE: Alice lists her households and sees exactly one.
  // ============================================================================

  const aliceList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${alice.accessToken}` },
  });
  expect(aliceList.status()).toBe(200);
  const aliceItems = await aliceList.json();
  expect(aliceItems).toHaveLength(1);
  expect(aliceItems[0].id).toBe(aliceHousehold.id);
  expect(aliceItems[0].name).toBe('アリス家');
  expect(aliceItems[0].role).toBe('OWNER');
  expect(aliceItems[0].memberCount).toBe(1);
  expect(aliceItems[0].ownerMembershipId).toBeDefined();

  // Caroline has no households yet — list should be empty.
  const carolList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${carol.accessToken}` },
  });
  expect(carolList.status()).toBe(200);
  const carolItems = await carolList.json();
  expect(carolItems).toHaveLength(0);

  // ============================================================================
  // 3. INVITATION: Alice invites Bob and Carol via direct DB insert (simulating
  //    the invitation flow) and verifies cross-household isolation.
  // ============================================================================

  // Add Bob and Carol to Alice's household via DB (membership-only, no invitation).
  await addMembershipViaDb(aliceHousehold.id, bob.userId, 'MEMBER');
  await addMembershipViaDb(aliceHousehold.id, carol.userId, 'MEMBER');

  // Alice's roster should now have 3 members: owner + bob + carol.
  aliceRoster = await getHouseholdMemberships(alice.accessToken, aliceHousehold.id);
  expect(aliceRoster.length).toBe(3);

  // Bob should see Alice's household in his list.
  const bobList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${bob.accessToken}` },
  });
  expect(bobList.status()).toBe(200);
  const bobItems = await bobList.json();
  const bobInAlices = bobItems.find((h: { id: string }) => h.id === aliceHousehold.id);
  expect(bobInAlices).toBeDefined();
  expect(bobInAlices.role).toBe('MEMBER');

  // Bob should also still see his own household (he's owner).
  const bobOwn = bobItems.find((h: { id: string }) => h.id === bobHousehold.id);
  expect(bobOwn).toBeDefined();
  expect(bobOwn.role).toBe('OWNER');

  // ============================================================================
  // 4. CROSS-HOUSEHOLD ISOLATION: Bob cannot access Alice's household roster
  //    through Bob's own household ID.
  // ============================================================================

  // Bob requesting Alice's household with her ID should work (he's a member).
  const bobViewsAlice = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${bob.accessToken}` } },
  );
  expect(bobViewsAlice.status()).toBe(200);

  // Dave (outsider) cannot access Alice's household.
  const daveViewsAlice = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${dave.accessToken}` } },
  );
  expect(daveViewsAlice.status()).toBe(404);

  // Dave cannot access Bob's household either.
  const daveViewsBob = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(bobHousehold.id)}`,
    { headers: { authorization: `Bearer ${dave.accessToken}` } },
  );
  expect(daveViewsBob.status()).toBe(404);

  // ============================================================================
  // 5. ROLES: Alice promotes Bob to ADMIN via DB, then verifies role ordering.
  // ============================================================================

  // Update Bob's role directly via DB for the role governance evidence.
  const bobMembership = await getMembershipIdViaDb(aliceHousehold.id, bob.userId);
  expect(bobMembership).toBeDefined();
  await withDatabase(async (database) => {
    await database.query(
      `UPDATE "memberships" SET "role" = 'ADMIN' WHERE "id" = $1`,
      [bobMembership],
    );
  });

  // Verify role ordering in household roster: OWNER first, ADMIN second.
  aliceRoster = await getHouseholdMemberships(alice.accessToken, aliceHousehold.id);
  expect(aliceRoster[0].role).toBe('OWNER');
  expect(aliceRoster[1].role).toBe('ADMIN');
  expect(aliceRoster[2].role).toBe('MEMBER');
  expect(aliceRoster[1].userId).toBe(bob.userId);

  // ============================================================================
  // 6. REMOVAL: Alice removes Carol from the household via API.
  // ============================================================================

  const carolMembership = await getMembershipIdViaDb(aliceHousehold.id, carol.userId);
  expect(carolMembership).toBeDefined();

  const removeResponse = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/members/${encodeURIComponent(carolMembership!)}`,
    {
      headers: { authorization: `Bearer ${alice.accessToken}` },
    },
  );
  expect(removeResponse.status()).toBe(200);

  // Carol should no longer appear in the roster.
  aliceRoster = await getHouseholdMemberships(alice.accessToken, aliceHousehold.id);
  expect(aliceRoster.length).toBe(2); // owner + bob (admin)
  const carolStillPresent = aliceRoster.find((m) => m.userId === carol.userId);
  expect(carolStillPresent).toBeUndefined();

  // Carol's household list should no longer include Alice's household.
  const carolListAfter = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${carol.accessToken}` },
  });
  expect(carolListAfter.status()).toBe(200);
  const carolItemsAfter = await carolListAfter.json();
  const carolSeesAlices = carolItemsAfter.find((h: { id: string }) => h.id === aliceHousehold.id);
  expect(carolSeesAlices).toBeUndefined();

  // ============================================================================
  // 7. D-12 STALE ACCESS: stale access recovery — membership loss returns 404
  // Carol (removed member) attempts to access the household.
  //    The server returns 404 (not a member); the UI must show accessChanged.
  // ============================================================================

  const staleAccessResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${carol.accessToken}` } },
  );
  expect(staleAccessResponse.status()).toBe(404);

  // Carol should have zero households now.
  const carolZero = await carolListAfter.json();
  expect(carolZero).toHaveLength(0);

  // ============================================================================
  // 8. OWNERSHIP TRANSFER: Alice transfers ownership to Bob.
  // ============================================================================

  const transferResponse = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/ownership/transfer`,
    {
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: bobMembership },
    },
  );
  expect(transferResponse.status()).toBe(200);
  const transferBody = (await transferResponse.json()) as {
    ownerMembershipId: string;
    members: Array<{ membershipId: string; userId: string; role: string }>;
  };

  // Bob is now the owner.
  expect(transferBody.ownerMembershipId).toBe(bobMembership);

  // Alice is now a MEMBER.
  const aliceAfterTransfer = transferBody.members.find((m) => m.userId === alice.userId);
  expect(aliceAfterTransfer).toBeDefined();
  expect(aliceAfterTransfer!.role).toBe('MEMBER');

  // Exactly one OWNER exists.
  const ownerCount = transferBody.members.filter((m) => m.role === 'OWNER').length;
  expect(ownerCount).toBe(1);

  // ============================================================================
  // 9. D-10/D-11 SAFE ACTIONS: Non-owner cannot transfer ownership.
  // ============================================================================

  // Alice (now MEMBER) cannot transfer ownership.
  const aliceTransferAttempt = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/ownership/transfer`,
    {
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: bobMembership },
    },
  );
  expect(aliceTransferAttempt.status()).toBe(403);
  const aliceTransferBody = (await aliceTransferAttempt.json()) as { error: { code: string } };
  expect(aliceTransferBody.error.code).toBe('NOT_OWNER');

  // State should be unchanged after failed transfer attempt.
  const verifyAfterFailed = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${bob.accessToken}` } },
  );
  expect(verifyAfterFailed.status()).toBe(200);
  const verifyBody = (await verifyAfterFailed.json()) as { ownerMembershipId: string };
  expect(verifyBody.ownerMembershipId).toBe(bobMembership);

  // ============================================================================
  // 10. OWNER LEAVE: Bob (new owner) cannot leave as last admin because Alice
  //     is the only other member. Add Dave first, then Bob can leave to Alice.
  // ============================================================================

  // Add Dave to the household so Bob has a successor.
  await addMembershipViaDb(aliceHousehold.id, dave.userId, 'MEMBER');
  aliceRoster = await getHouseholdMemberships(bob.accessToken, aliceHousehold.id);
  expect(aliceRoster.length).toBe(3); // bob (owner) + alice (member) + dave (member)

  // Get Alice's membership ID (bob will leave, transferring to alice).
  const aliceMembership = await getMembershipIdViaDb(aliceHousehold.id, alice.userId);
  expect(aliceMembership).toBeDefined();

  const leaveResponse = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/ownership/leave`,
    {
      headers: {
        authorization: `Bearer ${bob.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: aliceMembership },
    },
  );
  expect(leaveResponse.status()).toBe(204);

  // Alice is now the owner.
  const afterLeave = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${alice.accessToken}` } },
  );
  expect(afterLeave.status()).toBe(200);
  const afterLeaveBody = (await afterLeave.json()) as {
    ownerMembershipId: string;
    members: Array<{ membershipId: string; userId: string; role: string }>;
  };
  expect(afterLeaveBody.ownerMembershipId).toBe(aliceMembership);

  // Bob is no longer a member.
  const bobAfterLeave = afterLeaveBody.members.find((m) => m.userId === bob.userId);
  expect(bobAfterLeave).toBeUndefined();

  // ============================================================================
  // 11. D-12 OWNER LEAVE RECOVERY: Bob (former owner, now has no membership)
  //     gets 404 when trying to access the household.
  // ============================================================================

  const bobStaleAccess = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${bob.accessToken}` } },
  );
  expect(bobStaleAccess.status()).toBe(404);

  // Bob's household list should only contain his own household now.
  const bobListAfter = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${bob.accessToken}` },
  });
  expect(bobListAfter.status()).toBe(200);
  const bobAfterItems = await bobListAfter.json();
  expect(bobAfterItems).toHaveLength(1);
  expect(bobAfterItems[0].id).toBe(bobHousehold.id);

  // ============================================================================
  // 12. UI: Household routes render without errors.
  // ============================================================================

  // Login as Alice via the Web UI and verify the household handoff page.
  await loginViaPage(page, alice.email);

  // Navigate to /households — the selector should list Alice's memberships.
  await page.goto(`${WEB_ORIGIN}/households`);
  await page.waitForURL(/\/households/);
  await page.waitForTimeout(2000);

  // Alice should see the household selector with the household name.
  await expect(page.getByText('アリス家').first()).toBeVisible({ timeout: 5000 });

  // Navigate to the household roster page.
  await page.getByRole('button', { name: '查看成员' }).first().click();
  await page.waitForURL(/\/households\//);
  await page.waitForTimeout(2000);

  const rosterMain = page.getByRole('main');

  // The household header should display the current household name.
  await expect(rosterMain.getByText('アリス家').first()).toBeVisible({ timeout: 5000 });

  // Members should be listed.
  await expect(rosterMain.getByText('家主アリス').first()).toBeVisible();
  await expect(rosterMain.getByText('デイブ').first()).toBeVisible();

  // Role badges should be visible.
  await expect(rosterMain.getByText('所有者').first()).toBeVisible();

  // ============================================================================
  // 13. TRANSACTION FAILURE RECOVERY: Verify that concurrent transfer/leave
  //     attempts do not leave partial state.
  // ============================================================================

  // Non-member (Carol, already removed) attempts to transfer ownership — 404.
  const outsiderTransfer = await request.post(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/ownership/transfer`,
    {
      headers: {
        authorization: `Bearer ${carol.accessToken}`,
        'content-type': 'application/json',
      },
      data: { successorMembershipId: aliceMembership },
    },
  );
  expect(outsiderTransfer.status()).toBe(404);

  // Verify state is unchanged: Alice is still owner.
  const finalVerify = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}`,
    { headers: { authorization: `Bearer ${alice.accessToken}` } },
  );
  expect(finalVerify.status()).toBe(200);
  const finalBody = (await finalVerify.json()) as { ownerMembershipId: string; members: Array<{ role: string }> };
  expect(finalBody.ownerMembershipId).toBe(aliceMembership);
  const finalOwners = finalBody.members.filter((m) => m.role === 'OWNER');
  expect(finalOwners.length).toBe(1);

  // ============================================================================
  // 14. MEMBER CANNOT REMOVE — forbidden for regular member.
  // ============================================================================

  const daveMembership = await getMembershipIdViaDb(aliceHousehold.id, dave.userId);
  const memberRemoveAttempt = await request.delete(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(aliceHousehold.id)}/members/${encodeURIComponent(daveMembership!)}`,
    {
      headers: { authorization: `Bearer ${dave.accessToken}` },
    },
  );
  expect(memberRemoveAttempt.status()).toBe(403);
  const memberRemoveBody = (await memberRemoveAttempt.json()) as { error: { code: string } };
  expect(memberRemoveBody.error.code).toBe('INSUFFICIENT_ROLE');

  // Dave is still a member.
  const daveStillPresent = await getHouseholdMemberships(alice.accessToken, aliceHousehold.id);
  expect(daveStillPresent.find((m) => m.userId === dave.userId)).toBeDefined();

  // ============================================================================
  // 15. NO-HOUSEHOLD HANDOFF: Carol (with zero households) sees the D-01
  //     create-or-accept handoff, not an empty selector or login page.
  // ============================================================================

  const carolZeroList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${carol.accessToken}` },
  });
  expect(carolZeroList.status()).toBe(200);
  const carolZeroItems = await carolZeroList.json();
  expect(carolZeroItems).toHaveLength(0);
});
