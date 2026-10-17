import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:4321';
const originalMd = fs.readFileSync('config/sources.md', 'utf8');

async function runTests() {
  console.log('Running HTTP API tests against:', BASE_URL);

  try {
    // 1. GET /api/sources
    const getRes = await fetch(`${BASE_URL}/api/sources`);
    assert.equal(getRes.status, 200, `Expected 200, got ${getRes.status}`);
    const getData = await getRes.json();
    assert.ok(getData.success, 'GET response should have success: true');
    assert.ok(Array.isArray(getData.sources), 'sources should be an array');
    assert.equal(getData.sources.length, 29, `Expected 29 sources, got ${getData.sources.length}`);
    console.log(`✓ GET /api/sources returned ${getData.sources.length} sources`);

    // 2. PATCH /api/sources (Toggle status of #2)
    const patchRes = await fetch(`${BASE_URL}/api/sources`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '2', status: 'INACTIVE' }),
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.ok(patchData.success);
    assert.equal(patchData.source.status, 'INACTIVE');
    console.log('✓ PATCH /api/sources successfully toggled #2 to INACTIVE');

    // 3. POST /api/sources (Add new source)
    const postRes = await fetch(`${BASE_URL}/api/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    assert.equal(postData.source.id, '30');
    assert.equal(postData.source.name, 'Klub Muzyczny Gwarek');
    console.log('✓ POST /api/sources successfully added new source #30');

    // 4. Verify file content after API operations
    const fileAfterPost = fs.readFileSync('config/sources.md', 'utf8');
    assert.ok(fileAfterPost.includes('| 30 | Klub Muzyczny Gwarek | WEB | https://gwarek.gliwice.pl | Muzyka / Koncerty | ACTIVE | Pobieraj koncerty klubowe \\| bilety |'));
    assert.ok(fileAfterPost.includes('# Baza Źródeł Wydarzeń – Katowice i Metropolia GZM'));
    console.log('✓ Verified config/sources.md updated with correct row and escaped pipe');

    // 5. GET /admin/sources (HTML page)
    const pageRes = await fetch(`${BASE_URL}/admin/sources`);
    assert.equal(pageRes.status, 200);
    const pageHtml = await pageRes.text();
    assert.ok(pageHtml.includes('Źródła Wydarzeń'));
    console.log('✓ GET /admin/sources returned 200 and renders HTML');

    console.log('\nAll HTTP integration tests PASSED successfully!');
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
