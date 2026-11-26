import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:4321';
const originalMd = fs.readFileSync('config/sources.md', 'utf8');

function resolveAdminSecret() {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET.trim();
  if (fs.existsSync('.env')) {
    const envRaw = fs.readFileSync('.env', 'utf8');
    const match = envRaw.match(/^\s*ADMIN_SECRET\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n#]*))/m);
    const val = match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
    if (val.trim()) return val.trim();
  }
  return '';
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return '';
  const match = setCookieHeader.match(/kato_admin_session=([^;]+)/);
  return match ? `kato_admin_session=${match[1]}` : '';
}

async function runTests() {
  const adminSecret = resolveAdminSecret();
  assert.ok(adminSecret, 'ADMIN_SECRET musi być ustawiony w env lub pliku .env');

  console.log('Running HTTP API & Auth tests against:', BASE_URL);

  try {
    // 1. Niezalogowane zapytania do chronionych zasobów muszą zostać odrzucone
    const unauthEndpoints = [
      { method: 'GET', path: '/api/sources' },
      { method: 'POST', path: '/api/sources' },
      { method: 'PATCH', path: '/api/sources' },
      { method: 'GET', path: '/api/archive-settings' },
      { method: 'POST', path: '/api/archive-settings' },
      { method: 'POST', path: '/api/archive-run' },
      { method: 'POST', path: '/api/archive' },
    ];
    for (const ep of unauthEndpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.method === 'GET' ? undefined : JSON.stringify({}),
      });
      assert.equal(
        res.status,
        401,
        `Niezalogowane ${ep.method} ${ep.path} musi zwrócić 401, otrzymano ${res.status}`
      );
    }

    for (const adminPath of ['/admin/sources', '/admin/archive']) {
      const pageRedirectRes = await fetch(`${BASE_URL}${adminPath}`, { redirect: 'manual' });
      assert.equal(
        pageRedirectRes.status,
        302,
        `Niezalogowane GET ${adminPath} musi zwrócić 302, otrzymano ${pageRedirectRes.status}`
      );
      const location = pageRedirectRes.headers.get('location') || '';
      assert.ok(
        location.includes('/admin/login'),
        `Redirect z ${adminPath} musi kierować do /admin/login (otrzymano: ${location})`
      );
    }

    const sessionBeforeRes = await fetch(`${BASE_URL}/api/admin/session`);
    assert.equal(sessionBeforeRes.status, 200);
    const sessionBefore = await sessionBeforeRes.json();
    assert.equal(sessionBefore.authenticated, false);
    assert.equal(sessionBefore.configured, true);
    console.log('✓ Niezalogowane zapytania API (401) i strony admina (302 -> /admin/login) są zablokowane');

    // 2. Logowanie złym i poprawnym hasłem
    const badLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'BledneHasloTestowe123' }),
    });
    assert.equal(badLoginRes.status, 401);

    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminSecret }),
    });
    assert.equal(loginRes.status, 200, `Login should return 200, got ${loginRes.status}`);
    const loginData = await loginRes.json();
    assert.equal(loginData.success, true);

    const sessionCookie = extractSessionCookie(loginRes.headers.get('set-cookie'));
    assert.ok(sessionCookie.startsWith('kato_admin_session='), 'Login musi ustawić ciasteczko kato_admin_session');

    const sessionAfterRes = await fetch(`${BASE_URL}/api/admin/session`, {
      headers: { cookie: sessionCookie },
    });
    const sessionAfter = await sessionAfterRes.json();
    assert.equal(sessionAfter.authenticated, true);
    console.log('✓ Logowanie POST /api/admin/login ustawia sesję kato_admin_session');

    // 3. GET /api/sources (sesja cookie)
    const getRes = await fetch(`${BASE_URL}/api/sources`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(getRes.status, 200, `Expected 200, got ${getRes.status}`);
    const getData = await getRes.json();
    assert.ok(getData.success, 'GET response should have success: true');
    assert.ok(Array.isArray(getData.sources), 'sources should be an array');
    assert.equal(getData.sources.length, 30, `Expected 30 sources, got ${getData.sources.length}`);
    assert.ok(getData.balanceSettings, 'GET /api/sources must return balanceSettings');
    assert.equal(getData.balanceSettings.maxArticlesPerRun, 4);
    assert.equal(getData.balanceSettings.rssPoolShare, 0.5);
    assert.equal(getData.balanceSettings.maxPromptItems, 60);
    console.log(`✓ GET /api/sources returned ${getData.sources.length} sources + balanceSettings`);

    // 4. PATCH /api/sources z balanceSettings (przez Authorization: Bearer)
    const patchBalanceRes = await fetch(`${BASE_URL}/api/sources`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({
        balanceSettings: {
          maxArticlesPerRun: 5,
          maxCandidates: 8,
          rssPoolShare: 0.6,
          maxPromptItems: 50,
        },
      }),
    });
    assert.equal(patchBalanceRes.status, 200);
    const patchBalanceData = await patchBalanceRes.json();
    assert.equal(patchBalanceData.success, true);
    assert.equal(patchBalanceData.balanceSettings.maxArticlesPerRun, 5);
    assert.equal(patchBalanceData.balanceSettings.rssPoolShare, 0.6);
    assert.equal(patchBalanceData.balanceSettings.maxPromptItems, 50);
    console.log('✓ PATCH /api/sources with balanceSettings saved via Bearer auth');

    // 5. PATCH /api/sources (Toggle status of #2)
    const patchRes = await fetch(`${BASE_URL}/api/sources`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
      },
      body: JSON.stringify({ id: '2', status: 'INACTIVE' }),
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.ok(patchData.success);
    assert.equal(patchData.source.status, 'INACTIVE');
    console.log('✓ PATCH /api/sources successfully toggled #2 to INACTIVE');

    // 6. POST /api/sources (Add new source)
    const postRes = await fetch(`${BASE_URL}/api/sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: 'Klub Muzyczny Gwarek',
        type: 'WEB',
        url: 'https://gwarek.gliwice.pl',
        category: 'Muzyka / Koncerty',
        hints: 'Pobieraj koncerty klubowe | bilety',
        status: 'ACTIVE',
      }),
    });
    assert.equal(postRes.status, 201);
    const postData = await postRes.json();
    assert.ok(postData.success);
    assert.equal(postData.source.id, '31');
    assert.equal(postData.source.name, 'Klub Muzyczny Gwarek');
    console.log('✓ POST /api/sources successfully added new source #31');

    // 7. Verify file content after API operations
    const fileAfterPost = fs.readFileSync('config/sources.md', 'utf8');
    assert.ok(fileAfterPost.includes('| 31 | Klub Muzyczny Gwarek | WEB | https://gwarek.gliwice.pl | Muzyka / Koncerty | ACTIVE | Pobieraj koncerty klubowe \\| bilety |'));
    assert.ok(fileAfterPost.includes('# Baza Źródeł Wydarzeń – Katowice i Metropolia GZM'));
    assert.ok(fileAfterPost.includes('`maxArticlesPerRun`: 5'));
    console.log('✓ Verified config/sources.md updated with source row and balance settings');

    // 8. GET /admin/sources z aktywną sesją
    const pageRes = await fetch(`${BASE_URL}/admin/sources`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(pageRes.status, 200);
    const pageHtml = await pageRes.text();
    assert.ok(pageHtml.includes('Źródła Wydarzeń'));
    assert.ok(pageHtml.includes('Konfiguracja Workera AI'));
    console.log('✓ GET /admin/sources with session returned 200 and renders dashboard HTML');

    // 9. Logout
    const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: { cookie: sessionCookie },
    });
    assert.equal(logoutRes.status, 200);
    const clearCookieHeader = logoutRes.headers.get('set-cookie') || '';
    assert.ok(clearCookieHeader.includes('Max-Age=0'));

    console.log('\nAll HTTP integration & auth tests PASSED successfully!');
  } finally {
    // Restore config/sources.md
    fs.writeFileSync('config/sources.md', originalMd, 'utf8');
    console.log('✓ Cleaned up and restored config/sources.md');
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  fs.writeFileSync('config/sources.md', originalMd, 'utf8');
  process.exit(1);
});
