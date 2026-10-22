import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateArticle, writeArticle, parseSpodekOrMck } from './daily-digest.mjs';
import { runArchiveWorker } from './archive-worker.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja logiki dat: publishedDate vs eventDate (Clean Cutoff)');
console.log('======================================================\n');

const ROOT_DIR = process.cwd();
const NEWS_DIR = path.join(ROOT_DIR, 'src', 'content', 'news');

function parseFrontmatterMap(rawMd) {
  const match = rawMd.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'Plik Markdown musi posiadać poprawny blok frontmatter ---');
  const map = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (kv) {
      map[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 1. Czystość i integralność wszystkich plików w src/content/news/
// ---------------------------------------------------------------------------
console.log('--- 1. Czystość i integralność plików w src/content/news/ ---');

const files = fs.readdirSync(NEWS_DIR).filter((name) => /\.(md|mdx)$/i.test(name));
assert.ok(files.length > 0, 'Katalog src/content/news/ musi zawierać artykuły');

for (const file of files) {
  const filePath = path.join(NEWS_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const fm = parseFrontmatterMap(raw);

  assert.equal(
    'pubDate' in fm,
    false,
    `Plik ${file} NIE MOŻE zawierać starego klucza pubDate w frontmatterze!`
  );
  assert.equal(
    'sourceDate' in fm,
    false,
    `Plik ${file} NIE MOŻE zawierać starego klucza sourceDate w frontmatterze!`
  );

  assert.ok(
    fm.publishedDate && /^\d{4}-\d{2}-\d{2}$/.test(fm.publishedDate),
    `Plik ${file} musi posiadać poprawne pole publishedDate w formacie YYYY-MM-DD (otrzymano: ${fm.publishedDate})`
  );

  const pubYear = parseInt(fm.publishedDate.slice(0, 4), 10);
  assert.ok(
    pubYear <= 2026,
    `Plik ${file} ma publishedDate wskazujące na przyszły rok (${fm.publishedDate})!`
  );
}

// Szczegółowa weryfikacja wpisu Al Bano w Spodku
const alBanoFile = '2026-10-20-festiwal-i-love-italia-z-udzialem-al-bano-w-spodku.md';
const alBanoPath = path.join(NEWS_DIR, alBanoFile);
assert.ok(fs.existsSync(alBanoPath), `Plik ${alBanoFile} musi istnieć`);
const alBanoFm = parseFrontmatterMap(fs.readFileSync(alBanoPath, 'utf8'));
assert.equal(
  alBanoFm.publishedDate,
  '2026-10-20',
  'Wpis Al Bano musi mieć publishedDate: 2026-10-20'
);
assert.equal(
  alBanoFm.eventDate,
  '2028-03-11',
  'Wpis Al Bano musi mieć eventDate: 2028-03-11'
);

console.log(`✅ Zweryfikowano ${files.length} plików .md: zero kluczy pubDate/sourceDate, wszystkie publishedDate <= 2026, wpis Al Bano ma publishedDate: 2026-10-20 i eventDate: 2028-03-11.`);

// ---------------------------------------------------------------------------
// 2. Sortowanie feedu (po publishedDate, a nie po przyszłym eventDate)
// ---------------------------------------------------------------------------
console.log('\n--- 2. Sortowanie feedu: przyszły eventDate nie przypina artykułu na szczyt ---');

const feedItems = [
  {
    slug: '2026-10-20-festiwal-i-love-italia-z-udzialem-al-bano-w-spodku',
    title: 'Festiwal I Love Italia z udziałem Al Bano w Spodku',
    publishedDate: '2026-10-20T00:00:00.000Z',
    eventDate: '2028-03-11T00:00:00.000Z',
  },
  {
    slug: '2026-10-22-darmowe-sprawdzanie-swiatel-pojazdow-w-katowicach',
    title: 'Darmowe sprawdzanie świateł pojazdów w Katowicach',
    publishedDate: '2026-10-22T00:00:00.000Z',
    eventDate: null,
  },
];

// Sortowanie używane w src/pages/index.astro oraz InteractiveFeed.tsx (sortOrder === 'newest')
const sortedNewestFirst = [...feedItems].sort(
  (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
);

assert.equal(
  sortedNewestFirst[0].slug,
  '2026-10-22-darmowe-sprawdzanie-swiatel-pojazdow-w-katowicach',
  'Nowszy artykuł (publishedDate: 2026-10-22, eventDate: null) musi być na pierwszym miejscu'
);
assert.equal(
  sortedNewestFirst[1].slug,
  '2026-10-20-festiwal-i-love-italia-z-udzialem-al-bano-w-spodku',
  'Starszy artykuł (publishedDate: 2026-10-20) z przyszłym eventDate (2028-03-11) musi plasować się NIŻEJ'
);

console.log('✅ Sortowanie feedu działa poprawnie: artykuł z publishedDate: 2026-10-20 i eventDate: 2028-03-11 plasuje się NIŻEJ niż artykuł z publishedDate: 2026-10-22 i eventDate: null.');

// ---------------------------------------------------------------------------
// 3. Fallback w daily-digest.mjs (gdy źródło podaje wyłącznie przyszłą datę wydarzenia)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Fallback w daily-digest.mjs dla przyszłej daty wydarzenia ---');

const mockSpodekHtml = `
  <ul>
    <li>
      <a href="/wydarzenia/koncert-testowy-2028.html">
        <small>11 marca 2028</small>
        <h3>Koncert Testowy 2028 w Spodku</h3>
        <p>Wielkie widowisko muzyczne w Katowicach.</p>
      </a>
    </li>
  </ul>
`;

const parsedSpodekItems = parseSpodekOrMck(mockSpodekHtml, 'https://www.spodekkatowice.pl', 'katowice');
assert.equal(parsedSpodekItems.length, 1, 'Parser Spodka powinien wyodrębnić 1 wydarzenie');
assert.equal(parsedSpodekItems[0].eventDate, '2028-03-11', 'Parser powinien zapisać datę w polu eventDate');
assert.equal(parsedSpodekItems[0].pubDate, undefined, 'Parser nie może ustawiać przyszłej daty wydarzenia jako pubDate');

const fakeNow = new Date('2026-10-22T12:00:00Z');
const validatedArticle = validateArticle(
  {
    title: 'Koncert Testowy 2028 w Spodku',
    city: 'katowice',
    category: 'wydarzenia',
    status: 'published',
    eventDate: '2028-03-11',
    summary: 'Zapowiedź koncertu w Spodku w 2028 roku.',
    location: 'Spodek Katowice',
    isAlert: false,
    isForKids: false,
    sourceUrl: 'https://www.spodekkatowice.pl/wydarzenia/koncert-testowy-2028.html',
    content: 'Pełna treść zapowiedzi koncertu.',
  },
  parsedSpodekItems,
  fakeNow
);

assert.equal(
  validatedArticle.eventDate,
  '2028-03-11',
  'eventDate musi zachować przyszłą datę wydarzenia (2028-03-11)'
);
assert.equal(
  validatedArticle.publishedDate,
  '2026-10-22',
  'publishedDate musi przyjąć bieżącą datę publikacji na portalu Co Tam KATO (2026-10-22)'
);

// Sprawdzenie zapisu przez writeArticle (brak pubDate i sourceDate w wygenerowanym pliku)
const tempToday = '2026-10-22';
const expectedTempFile = path.join(NEWS_DIR, `${tempToday}-koncert-testowy-2028-w-spodku.md`);
try {
  const written = writeArticle(validatedArticle, tempToday);
  assert.equal(written, true, 'writeArticle powinno zapisać plik');
  const writtenContent = fs.readFileSync(expectedTempFile, 'utf8');
  const writtenFm = parseFrontmatterMap(writtenContent);

  assert.equal(writtenFm.publishedDate, '2026-10-22', 'Zapisany plik musi mieć publishedDate: 2026-10-22');
  assert.equal(writtenFm.eventDate, '2028-03-11', 'Zapisany plik musi mieć eventDate: 2028-03-11');
  assert.equal('pubDate' in writtenFm, false, 'writeArticle NIE MOŻE zapisywać klucza pubDate');
  assert.equal('sourceDate' in writtenFm, false, 'writeArticle NIE MOŻE zapisywać klucza sourceDate');
} finally {
  if (fs.existsSync(expectedTempFile)) fs.unlinkSync(expectedTempFile);
}

console.log('✅ Fallback w daily-digest.mjs oraz writeArticle zweryfikowane: eventDate = 2028-03-11, publishedDate = 2026-10-22, brak legacy pubDate/sourceDate.');

// ---------------------------------------------------------------------------
// 4. Auto-archiwizacja w archive-worker.mjs dla wpisu z przyszłym eventDate
// ---------------------------------------------------------------------------
console.log('\n--- 4. Auto-archiwizacja w archive-worker.mjs dla wpisu z przyszłym eventDate ---');

const workerTestSlug = '2026-10-01-test-future-event-auto-archive';
const workerTestPath = path.join(NEWS_DIR, `${workerTestSlug}.md`);

// Wpis opublikowany 2026-10-01 (21 dni przed 2026-10-22), ale dotyczący wydarzenia w 2028 r.
fs.writeFileSync(
  workerTestPath,
  `---
title: "Testowe Wydarzenie 2028 do Auto-Archiwizacji"
publishedDate: 2026-10-01
eventDate: 2028-03-11
city: "katowice"
category: "wydarzenia"
status: "published"
archived: false
manualOverride: false
summary: "Wpis testowy z przyszłym eventDate i starszym publishedDate."
isAlert: false
aiGenerated: true
---

Treść testowa.
`,
  'utf8'
);

try {
  const referenceDate = new Date('2026-10-22T02:00:00+02:00');
  const result = await runArchiveWorker({
    force: true,
    customDays: 15,
    referenceDate,
  });

  assert.equal(result.executed, true, 'Worker archiwizacji powinien się wykonać');
  const archivedEntry = result.archivedArticles.find((a) => a.file === `${workerTestSlug}.md`);
  assert.ok(
    archivedEntry,
    'Wpis z przyszłym eventDate (2028-03-11), ale publishedDate starszym niż 10 dni (2026-10-01), MUSI zostać zarchiwizowany'
  );
  assert.equal(
    archivedEntry.diffDays,
    21,
    `Wyliczone diffDays musi wynosić +21 dni (a nie ujemną wartość z 2028 r.), otrzymano: ${archivedEntry.diffDays}`
  );

  const afterWorkerContent = fs.readFileSync(workerTestPath, 'utf8');
  const afterWorkerFm = parseFrontmatterMap(afterWorkerContent);
  assert.equal(afterWorkerFm.archived, 'true', 'Flaga archived w pliku musi zostać zmieniona na true');
  assert.equal(afterWorkerFm.eventDate, '2028-03-11', 'Pole eventDate musi pozostać nienaruszone');

  console.log(`✅ Auto-archiwizacja działa poprawnie: diffDays = +${archivedEntry.diffDays} (> 10 dni), artykuł z eventDate: 2028-03-11 został zarchiwizowany.`);
} finally {
  if (fs.existsSync(workerTestPath)) fs.unlinkSync(workerTestPath);
}

console.log('\n🎉 Wszystkie testy logiki dat (test-dates-logic.mjs) zakończone sukcesem (100% PASS)!\n');
