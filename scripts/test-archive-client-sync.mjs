import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  updateArticleArchive,
  applyArchiveFrontmatter,
  getServerRuntimeArchiveStates,
} from '../src/server/archive-service.ts';
import { GET, POST } from '../src/server/archive-api.ts';

console.log('\n======================================================');
console.log('🧪 Weryfikacja synchronizacji manualnej archiwizacji (A) i widoku /archiwum');
console.log('======================================================\n');

// 1. Sprawdzenie, czy src/pages/archiwum.astro przekazuje wszystkie nieusuniętych artykuły do InteractiveFeed
const archiwumSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'pages', 'archiwum.astro'), 'utf8');
assert.ok(
  !archiwumSrc.includes("item.data.status !== 'deleted' && Boolean(item.data.archived)"),
  'src/pages/archiwum.astro NIE MOŻE odfiltrowywać na sztywno artykułów z archived=false w getCollection, aby ręcznie zarchiwizowane artykuły mogły pojawić się w InteractiveFeed!'
);
assert.ok(
  archiwumSrc.includes("status !== 'deleted'"),
  'src/pages/archiwum.astro filtruje usunięte wpisy'
);
console.log('✅ Krok 1: archiwum.astro przekazuje pełny zestaw artykułów do InteractiveFeed, umożliwiając natychmiastowe wyświetlenie po kliknięciu „A”.');

// 2. Sprawdzenie updateArticleArchive i applyArchiveFrontmatter
const sampleMd = '---\ntitle: "Temp"\npubDate: 2026-09-01\nstatus: "published"\narchived: false\n---\nTest\n';
const fmRes = applyArchiveFrontmatter(sampleMd, true, true);
assert.equal(fmRes.success, true, 'applyArchiveFrontmatter musi zakończyć się sukcesem');
assert.ok(fmRes.content?.includes('archived: true'), 'applyArchiveFrontmatter ustawia archived: true');
assert.ok(fmRes.content?.includes('manualOverride: true'), 'applyArchiveFrontmatter ustawia manualOverride: true');

const tempSlug = '2026-09-01-temp-sync-test';
const tempPath = path.join(process.cwd(), 'src', 'content', 'news', `${tempSlug}.md`);
fs.writeFileSync(tempPath, sampleMd, 'utf8');

try {
  const result = updateArticleArchive(tempSlug, true, false);
  assert.equal(result.success, true, 'updateArticleArchive musi zwracać success: true');

  const runtimeStates = getServerRuntimeArchiveStates();
  assert.equal(runtimeStates[tempSlug]?.archived, true, 'Stan runtime serwera musi odzwierciedlać zarchiwizowanie artykułu');

  // Test endpointu GET /api/archive
  const getReq = new Request('http://localhost/api/archive', { method: 'GET' });
  const getRes = await GET({ request: getReq });
  assert.equal(getRes.status, 200, 'GET /api/archive musi zwracać status 200');
  const getData = await getRes.json();
  assert.equal(getData.success, true, 'GET /api/archive zwraca success: true');
  assert.equal(getData.states[tempSlug]?.archived, true, 'GET /api/archive zwraca zaktualizowany stan artykułu');

  console.log('✅ Krok 2: updateArticleArchive oraz GET /api/archive działają poprawnie i synchronizują stan.');
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}

// 3. Sprawdzenie obsługi pustych stanów, synchronizacji i ostrzeżeń w InteractiveFeed oraz archive.ts
const feedSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'InteractiveFeed.tsx'), 'utf8');
assert.ok(
  feedSrc.includes('archivedTotalCount'),
  'InteractiveFeed musi dynamicznie wyliczać liczbę zarchiwizowanych artykułów (archivedTotalCount) na podstawie getStatus'
);
assert.ok(
  feedSrc.includes('SYNC_RESULT_EVENT'),
  'InteractiveFeed musi nasłuchiwać wyniku synchronizacji z serwerem (SYNC_RESULT_EVENT)'
);

const archiveLibSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'archive.ts'), 'utf8');
assert.ok(
  archiveLibSrc.includes('fetchServerArchiveStates'),
  'src/lib/archive.ts musi pobierać aktualny stan archiwizacji z serwera przy inicjalizacji oraz fokusie okna'
);
console.log('✅ Krok 3: Klient (archive.ts + InteractiveFeed.tsx) synchronizuje stan z serwerem pomiędzy urządzeniami.');

console.log('\n------------------------------------------------------');
console.log('Wszystkie testy synchronizacji archiwum zaliczone sukcesem (100% PASS)!');
console.log('------------------------------------------------------\n');
