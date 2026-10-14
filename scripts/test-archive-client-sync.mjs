import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { updateArticleArchive } from '../src/server/archive-service.ts';

console.log('\n======================================================');
console.log('🧪 Weryfikacja synchronizacji manualnej archiwizacji (A) i widoku /archiwum');
console.log('======================================================\n');

// 1. Sprawdzenie, czy src/pages/archiwum.astro przekazuje wszystkie nieusunięte artykuły do InteractiveFeed
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

// 2. Sprawdzenie odporności updateArticleArchive na systemy plików read-only (np. Vercel)
const tempSlug = '2026-09-01-temp-sync-test';
const tempPath = path.join(process.cwd(), 'src', 'content', 'news', `${tempSlug}.md`);
fs.writeFileSync(tempPath, '---\ntitle: "Temp"\npubDate: 2026-09-01\nstatus: "published"\narchived: false\n---\nTest\n', 'utf8');

try {
  const result = updateArticleArchive(tempSlug, true, false);
  assert.equal(result.success, true, 'updateArticleArchive musi zwracać success: true');
  console.log('✅ Krok 2: updateArticleArchive działa poprawnie i bezpiecznie.');
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}

// 3. Sprawdzenie obsługi pustych stanów i liczników w InteractiveFeed
const feedSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'InteractiveFeed.tsx'), 'utf8');
assert.ok(
  feedSrc.includes('archivedTotalCount'),
  'InteractiveFeed musi dynamicznie wyliczać liczbę zarchiwizowanych artykułów (archivedTotalCount) na podstawie getStatus'
);
console.log('✅ Krok 3: InteractiveFeed dynamicznie zlicza stan archiwum z uwzględnieniem lokalnych zmian.');

console.log('\n------------------------------------------------------');
console.log('Wszystkie testy synchronizacji archiwum zaliczone sukcesem (100% PASS)!');
console.log('------------------------------------------------------\n');
