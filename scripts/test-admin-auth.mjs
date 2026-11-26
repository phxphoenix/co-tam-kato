import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_SESSION_COOKIE,
  buildAdminSessionCookieHeader,
  buildClearAdminSessionCookieHeader,
  checkLoginRateLimit,
  clearLoginRateLimit,
  createAdminSessionToken,
  isAdminAuthenticated,
  isAdminSecretConfigured,
  recordFailedLoginAttempt,
  requireAdminApiAuth,
  sanitizeAdminRedirect,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from '../src/server/admin-auth.ts';
import { POST as archivePost } from '../src/server/archive-api.ts';

console.log('\n======================================================');
console.log('🧪 Testy jednostkowe autoryzacji administratora (ADMIN_SECRET)');
console.log('======================================================\n');

const origAdminSecret = process.env.ADMIN_SECRET;
const origGithubToken = process.env.GITHUB_TOKEN;

try {
  const TEST_SECRET = 'TestSecret!1234567890';
  process.env.ADMIN_SECRET = TEST_SECRET;

  // 1. Konfiguracja i weryfikacja hasła (timingSafeEqual)
  assert.equal(isAdminSecretConfigured(), true);
  assert.equal(verifyAdminPassword(TEST_SECRET), true, 'Poprawne hasło musi zostać zaakceptowane');
  assert.equal(verifyAdminPassword('ZleHaslo!'), false, 'Błędne hasło musi zostać odrzucone');
  assert.equal(verifyAdminPassword(''), false, 'Puste hasło musi zostać odrzucone');
  console.log('✓ verifyAdminPassword (poprawne, błędne, puste)');

  // 2. Token sesji HMAC-SHA256: ważny, wygasły, sfałszowany
  const now = 1_700_000_000_000;
  const token = createAdminSessionToken({ secret: TEST_SECRET, nowMs: now, ttlSeconds: 60 });
  assert.equal(verifyAdminSessionToken(token, { secret: TEST_SECRET, nowMs: now + 10_000 }), true);
  assert.equal(
    verifyAdminSessionToken(token, { secret: TEST_SECRET, nowMs: now + 61_000 }),
    false,
    'Wygasły token musi zostać odrzucony'
  );
  const tamperedSig = token.slice(0, -4) + 'AAAA';
  assert.equal(
    verifyAdminSessionToken(tamperedSig, { secret: TEST_SECRET, nowMs: now + 1_000 }),
    false,
    'Zmodyfikowany podpis HMAC musi zostać odrzucony'
  );
  assert.equal(verifyAdminSessionToken('invalid.token', { secret: TEST_SECRET }), false);
  console.log('✓ createAdminSessionToken & verifyAdminSessionToken (ważny, wygasły, sfałszowany)');

  // 3. Ciasteczko kato_admin_session, nagłówek Bearer oraz x-admin-secret
  const validToken = createAdminSessionToken({ secret: TEST_SECRET });
  const cookieHeaderValue = `${ADMIN_SESSION_COOKIE}=${validToken}`;
  const reqWithCookie = new Request('http://127.0.0.1:4321/api/sources', {
    headers: { cookie: cookieHeaderValue },
  });
  assert.equal(await isAdminAuthenticated(reqWithCookie), true);
  assert.equal(await requireAdminApiAuth(reqWithCookie), null);

  const reqWithBearer = new Request('http://127.0.0.1:4321/api/sources', {
    headers: { Authorization: `Bearer ${TEST_SECRET}` },
  });
  assert.equal(await isAdminAuthenticated(reqWithBearer), true);
  assert.equal(await requireAdminApiAuth(reqWithBearer), null);

  const reqWithHeaderSecret = new Request('http://127.0.0.1:4321/api/sources', {
    headers: { 'x-admin-secret': TEST_SECRET },
  });
  assert.equal(await isAdminAuthenticated(reqWithHeaderSecret), true);

  const reqUnauth = new Request('http://127.0.0.1:4321/api/sources');
  assert.equal(await isAdminAuthenticated(reqUnauth), false);
  const unauthRes = await requireAdminApiAuth(reqUnauth);
  assert.ok(unauthRes, 'Brak sesji musi zwrócić Response 401');
  assert.equal(unauthRes.status, 401);

  const setCookieStr = buildAdminSessionCookieHeader(validToken, { secure: false });
  assert.ok(setCookieStr.includes('HttpOnly'));
  assert.ok(setCookieStr.includes('SameSite=Lax'));
  assert.ok(!setCookieStr.includes('Secure'));

  const clearCookieStr = buildClearAdminSessionCookieHeader({ secure: true });
  assert.ok(clearCookieStr.includes('Max-Age=0'));
  assert.ok(clearCookieStr.includes('Secure'));
  console.log('✓ Ciasteczko HttpOnly, Authorization: Bearer, x-admin-secret oraz odpowiedź 401');

  // 4. Brak ADMIN_SECRET -> 503 Service Unavailable
  process.env.ADMIN_SECRET = '';
  assert.equal(isAdminSecretConfigured(), false);
  const missingSecretRes = await requireAdminApiAuth(reqWithBearer);
  assert.ok(missingSecretRes, 'Brak ADMIN_SECRET musi zwrócić 503');
  assert.equal(missingSecretRes.status, 503);
  process.env.ADMIN_SECRET = TEST_SECRET;
  console.log('✓ Brak ADMIN_SECRET zwraca 503 Service Unavailable');

  // 5. Rate-limiter prób logowania (8 prób -> 9. zablokowana)
  clearLoginRateLimit();
  const ipA = '192.168.10.10';
  const ipB = '192.168.10.20';
  for (let i = 0; i < 7; i++) {
    const res = recordFailedLoginAttempt(ipA, now + i * 1000);
    assert.equal(res.allowed, true, `Próba ${i + 1} powinna być dozwolona`);
  }
  const eighth = recordFailedLoginAttempt(ipA, now + 8000);
  assert.equal(eighth.allowed, false, '8. nieudana próba blokuje kolejne próby');
  assert.equal(checkLoginRateLimit(ipA, now + 9000).allowed, false);
  assert.equal(checkLoginRateLimit(ipB, now + 9000).allowed, true, 'Inny IP nie może być zablokowany');
  assert.equal(
    checkLoginRateLimit(ipA, now + 16 * 60 * 1000).allowed,
    true,
    'Po upływie okna 15 min blokada musi wygasnąć'
  );
  clearLoginRateLimit();
  console.log('✓ Rate-limiter brute-force (blokada po 8 nieudanych próbach i odblokowanie po czasie)');

  // 6. sanitizeAdminRedirect (ochrona przed Open Redirect)
  assert.equal(sanitizeAdminRedirect('/admin/archive', '/'), '/admin/archive');
  assert.equal(sanitizeAdminRedirect('/admin/sources?tab=1', '/'), '/admin/sources?tab=1');
  assert.equal(sanitizeAdminRedirect('//evil.com', '/'), '/admin/sources');
  assert.equal(sanitizeAdminRedirect('https://evil.com/admin', '/'), '/admin/sources');
  assert.equal(sanitizeAdminRedirect('/wpis/abc', '/'), '/admin/sources');
  console.log('✓ sanitizeAdminRedirect blokuje Open Redirect');

  // 7. POST /api/archive: blokada nieautoryzowanego wywołania nawet gdy GITHUB_TOKEN jest w env
  process.env.GITHUB_TOKEN = 'ghp_server_env_token_should_not_auth_guest';
  const guestArchiveReq = new Request('http://127.0.0.1:4321/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'test', archived: true }),
  });
  const guestArchiveRes = await archivePost({ request: guestArchiveReq });
  assert.equal(
    guestArchiveRes.status,
    401,
    'POST /api/archive musi odrzucać gościa (401) nawet przy ustawionym GITHUB_TOKEN w env'
  );

  const tempSlug = '2026-11-20-temp-auth-archive-test';
  const tempFile = path.join(process.cwd(), 'src', 'content', 'news', `${tempSlug}.md`);
  fs.writeFileSync(
    tempFile,
    '---\ntitle: "Auth Test"\npublishedDate: 2026-11-20\nstatus: "published"\narchived: false\n---\nTest\n',
    'utf8'
  );
  try {
    const adminArchiveReq = new Request('http://127.0.0.1:4321/api/archive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_SECRET}`,
      },
      body: JSON.stringify({ slug: tempSlug, archived: true }),
    });
    const adminArchiveRes = await archivePost({ request: adminArchiveReq });
    assert.equal(adminArchiveRes.status, 200, 'POST /api/archive z Bearer ADMIN_SECRET musi zwracać 200');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
  console.log('✓ POST /api/archive wymaga sesji admina (lub OAuth Keystatic) i akceptuje Bearer ADMIN_SECRET');

  console.log('\n🎉 Wszystkie testy autoryzacji administratora zakończone sukcesem!\n');
} finally {
  if (origAdminSecret === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = origAdminSecret;

  if (origGithubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = origGithubToken;

  clearLoginRateLimit();
}
