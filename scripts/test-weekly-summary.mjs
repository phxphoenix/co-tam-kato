import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BALANCE_SETTINGS,
  shouldGenerateWeeklySummary,
  buildWeeklyVenueSummary,
  getIsoWeekRangeWarsaw,
  isWeeklySummaryRecord,
  computeRecentDistribution,
  computeBalanceBudget,
  buildCoveredTopics,
  selectPromptItems,
  isDuplicateArticle,
  resolveCandidateArticles,
  validateArticle,
  writeArticle,
  loadNewsRecords,
} from './daily-digest.mjs';
import { resolveArticlePublishedDate } from './archive-worker.mjs';
import { z } from 'astro/zod';

// Wyciągamy dozwolone enumeracje bezpośrednio z src/content.config.ts, aby walidować zgodność frontmattera ze schematem Astro
const contentConfigRaw = fs.readFileSync(path.resolve('src/content.config.ts'), 'utf8');
function extractTsArrayValues(src, constName) {
  const m = src.match(new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s*const`));
  assert.ok(m, `Nie znaleziono ${constName} w src/content.config.ts`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}
const CITY_VALUES = extractTsArrayValues(contentConfigRaw, 'CITY_VALUES');
const CATEGORY_VALUES = extractTsArrayValues(contentConfigRaw, 'CATEGORY_VALUES');
const STATUS_VALUES = extractTsArrayValues(contentConfigRaw, 'STATUS_VALUES');

const newsSchema = z.object({
  title: z.string().min(1),
  publishedDate: z.coerce.date(),
  eventDate: z.coerce.date().nullable().optional(),
  city: z.enum(CITY_VALUES),
  category: z.enum(CATEGORY_VALUES),
  status: z.enum(STATUS_VALUES).default('published'),
  summary: z.string().min(1),
  location: z.string().optional(),
  isAlert: z.boolean().default(false),
  isForKids: z.boolean().default(false),
  ageRange: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  aiGenerated: z.boolean().default(false),
  archived: z.boolean().default(false),
  manualOverride: z.boolean().default(false),
});

console.log('\n======================================================');
console.log('🧪 Testy wpisu zbiorczego „Tydzień w kulturze” (§6 / D2)');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
// 1. Tydzień ISO wg Europe/Warsaw, poniedziałek i kolejne dni, idempotencja
// ---------------------------------------------------------------------------
console.log('--- 1. shouldGenerateWeeklySummary: tydzień ISO, poniedziałek..niedziela i idempotencja ---');
{
  // Poniedziałek 09.11.2026
  const monday = new Date('2026-11-09T07:00:00+01:00');
  // Środa 11.11.2026 (ten sam tydzień ISO: 09.11..15.11)
  const wednesday = new Date('2026-11-11T13:00:00+01:00');
  // Niedziela 15.11.2026 (koniec tego samego tygodnia ISO)
  const sunday = new Date('2026-11-15T19:00:00+01:00');
  // Kolejny poniedziałek 16.11.2026 (nowy tydzień ISO: 16.11..22.11)
  const nextMonday = new Date('2026-11-16T07:00:00+01:00');

  const weekRange = getIsoWeekRangeWarsaw(wednesday);
  assert.equal(weekRange.mondayIso, '2026-11-09');
  assert.equal(weekRange.sundayIso, '2026-11-15');

  // Brak jakichkolwiek plików -> generuj zarówno w poniedziałek, jak i w środę czy niedzielę
  assert.equal(shouldGenerateWeeklySummary([], monday), true, 'W poniedziałek przy braku pliku musi zwrócić true');
  assert.equal(shouldGenerateWeeklySummary([], wednesday), true, 'W środę przy braku pliku z bieżącego tygodnia musi zwrócić true');
  assert.equal(shouldGenerateWeeklySummary([], sunday), true, 'W niedzielę przy braku pliku z bieżącego tygodnia musi zwrócić true');

  // Plik z poprzedniego tygodnia ISO (np. niedziela 08.11.2026) NIE blokuje nowego tygodnia
  const prevWeekRecords = [
    {
      file: '2026-11-08-tydzien-w-kulturze-nospr-teatry-i-spodek-08-11-22-.md',
      addedDate: '2026-11-08',
      status: 'published',
      aiGenerated: true,
    },
  ];
  assert.equal(
    shouldGenerateWeeklySummary(prevWeekRecords, monday),
    true,
    'Wpis z poprzedniego tygodnia ISO (08.11) nie może blokować nowego tygodnia (09.11)'
  );

  // Po wygenerowaniu wpisu w poniedziałek (09.11) -> idempotencja blokuje kolejne uruchomienia w tym samym tygodniu
  const currentWeekRecords = [
    ...prevWeekRecords,
    {
      file: '2026-11-09-tydzien-w-kulturze-nospr-teatry-i-spodek-09-11-23-.md',
      addedDate: '2026-11-09',
      status: 'published',
      aiGenerated: true,
    },
  ];
  assert.equal(
    shouldGenerateWeeklySummary(currentWeekRecords, monday),
    false,
    'Ponowne uruchomienie w poniedziałek musi pominąć wpis zbiorczy'
  );
  assert.equal(
    shouldGenerateWeeklySummary(currentWeekRecords, wednesday),
    false,
    'Uruchomienie w środę tego samego tygodnia ISO musi pominąć wpis zbiorczy'
  );
  assert.equal(
    shouldGenerateWeeklySummary(currentWeekRecords, sunday),
    false,
    'Uruchomienie w niedzielę tego samego tygodnia ISO musi pominąć wpis zbiorczy'
  );
  assert.equal(
    shouldGenerateWeeklySummary(currentWeekRecords, nextMonday),
    true,
    'W kolejny poniedziałek (16.11) musi wygenerować nowy wpis zbiorczy'
  );

  // Gdyby wpis powstał dopiero we środę (11.11), blokuje czwartek..niedzielę
  const generatedOnWednesday = [
    {
      file: '2026-11-11-tydzien-w-kulturze-nospr-teatry-i-spodek-11-11-25-.md',
      addedDate: '2026-11-11',
      status: 'published',
      aiGenerated: true,
    },
  ];
  assert.equal(shouldGenerateWeeklySummary(generatedOnWednesday, sunday), false);

  // Strefa czasowa Europe/Warsaw na granicy niedziela UTC / poniedziałek czasu polskiego (2026-11-08T23:30:00Z = 2026-11-09 00:30 CET)
  const mondayNightWarsaw = new Date('2026-11-08T23:30:00Z');
  assert.equal(
    shouldGenerateWeeklySummary(prevWeekRecords, mondayNightWarsaw),
    true,
    'O 00:30 czasu polskiego w poniedziałek (23:30 UTC w niedzielę) obowiązuje już nowy tydzień ISO'
  );

  // Wyłączenie w ustawieniach (weeklySummaryEnabled: false)
  assert.equal(
    shouldGenerateWeeklySummary([], monday, { ...DEFAULT_BALANCE_SETTINGS, weeklySummaryEnabled: false }),
    false,
    'Gdy weeklySummaryEnabled === false, nie generujemy wpisu zbiorczego'
  );

  // Usunięty (status: deleted) wpis zbiorczy nie blokuje wygenerowania poprawnego
  const deletedWeekly = [
    {
      file: '2026-11-09-tydzien-w-kulturze-nospr-teatry-i-spodek.md',
      addedDate: '2026-11-09',
      status: 'deleted',
      aiGenerated: true,
    },
  ];
  assert.equal(shouldGenerateWeeklySummary(deletedWeekly, wednesday), true);
}
console.log('✅ shouldGenerateWeeklySummary poprawnie obsługuje tydzień ISO wg Europe/Warsaw oraz idempotencję.');

// ---------------------------------------------------------------------------
// 2. < 3 wydarzeń -> brak wpisu (null) oraz filtrowanie horyzontu i bez daty
// ---------------------------------------------------------------------------
console.log('\n--- 2. buildWeeklyVenueSummary: próg < 3 wydarzeń i filtrowanie horyzontu ---');
{
  const now = new Date('2026-11-11T12:00:00Z');

  // Tylko 2 ważne wydarzenia w horyzoncie (+ 1 bez daty, + 1 poza horyzontem, + 1 NOSPR Aktualności, + 1 wyprzedane)
  const tooFewItems = [
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Koncert kameralny 1',
      link: 'https://nospr.org.pl/pl/kalendarz/koncert-1',
      eventDate: '2026-11-14',
      description: 'Wydarzenie w NOSPR: Koncert 1. Termin: 2026-11-14, godz. 19:30. Miejsce: NOSPR Katowice, Sala kameralna. Status biletów: Bilety w sprzedaży.',
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    {
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      title: 'Pokora',
      link: 'https://teatrslaski.art.pl/repertuar/pokora/',
      eventDate: '2026-11-18',
      description: 'Spektakl w Teatrze Śląskim: Pokora. Najbliższy termin: 2026-11-18, godz. 19:00. Scena: Teatr Śląski – Duża Scena. Status biletów: Bilety w sprzedaży.',
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    // Bez daty -> pominięte
    {
      sourceId: '5',
      sourceName: 'Spodek',
      title: 'Wydarzenie bez daty',
      link: 'https://www.spodekkatowice.pl/pl/wydarzenia/bez-daty.html',
      eventDate: null,
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    // Poza horyzontem 14 dni (2026-11-26 > 2026-11-25) -> pominięte
    {
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      title: 'Spektakl za 15 dni',
      link: 'https://teatr-rozrywki.pl/repertuar/za-15-dni.html',
      eventDate: '2026-11-26',
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    // NOSPR Aktualności (ID 30) -> pominięte
    {
      sourceId: '30',
      sourceName: 'NOSPR – Aktualności',
      title: 'Komunikat o kasach biletowych',
      link: 'https://nospr.org.pl/pl/aktualnosci/komunikat',
      eventDate: '2026-11-15',
      isEvent: false,
    },
    // Wyprzedane -> pominięte
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Koncert wyprzedany',
      link: 'https://nospr.org.pl/pl/kalendarz/wyprzedany',
      eventDate: '2026-11-15',
      ticketStatus: 'Brak biletów',
      isEvent: true,
    },
  ];

  const resultNull = buildWeeklyVenueSummary(tooFewItems, [], now, DEFAULT_BALANCE_SETTINGS);
  assert.equal(resultNull, null, 'Gdy w horyzoncie są mniej niż 3 wydarzenia, funkcja musi zwrócić null');
}
console.log('✅ Mniej niż 3 wydarzenia w horyzoncie zwraca null; wydarzenia bez daty i poza horyzontem są odrzucane.');

// ---------------------------------------------------------------------------
// 3. Sortowanie, grupowanie w sekcje, polskie dni tygodnia, ⚠️ Ostatnie bilety i linki do istniejących artykułów
// ---------------------------------------------------------------------------
console.log('\n--- 3. Format §6: sekcje, sortowanie, polskie daty, ⚠️ Ostatnie bilety i [nasz artykuł] ---');
{
  const now = new Date('2026-11-11T12:00:00Z');

  const sampleSourceItems = [
    // NOSPR - późniejsza data podana jako pierwsza, żeby sprawdzić sortowanie
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Sinfonia Varsovia i Pinchas Zukerman',
      link: 'https://nospr.org.pl/pl/kalendarz/sinfonia-varsovia',
      eventDate: '2026-11-23', // poniedziałek
      description: 'Wydarzenie w NOSPR: Sinfonia Varsovia i Pinchas Zukerman. Termin: 2026-11-23, godz. 19:30. Miejsce: NOSPR Katowice, Sala koncertowa. Status biletów: Bilety w sprzedaży.',
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    // NOSPR - wcześniejsza data + Ostatnie bilety + dopasowanie po URL do istniejącego artykułu
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Urban Jazz Night – Leszek Możdżer & EABS',
      link: 'https://nospr.org.pl/pl/kalendarz/urban-jazz-night',
      eventDate: '2026-11-14', // sobota
      description: 'Wydarzenie w NOSPR: Urban Jazz Night – Leszek Możdżer & EABS. Termin: 2026-11-14, godz. 18:00. Miejsce: NOSPR Katowice, Sala koncertowa. Status biletów: Ostatnie bilety w sprzedaży.',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
      isEvent: true,
    },
    // Teatr Śląski - dopasowanie po areTitlesSimilar do istniejącego artykułu
    {
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      title: 'Tragedyjo Hamleta, ksiyncia Dynymarku na Dużej Scenie',
      link: 'https://teatrslaski.art.pl/repertuar/hamlet/',
      eventDate: '2026-11-15', // niedziela
      description: 'Spektakl w Teatrze Śląskim: Tragedyjo Hamleta, ksiyncia Dynymarku na Dużej Scenie. Najbliższy termin: 2026-11-15, godz. 19:00. Scena: Teatr Śląski – Duża Scena. Status biletów: Bilety w sprzedaży.',
      ticketStatus: 'Bilety w sprzedaży',
      isEvent: true,
    },
    // Teatr Rozrywki - Ostatnie wolne miejsca
    {
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      title: 'Koty – musical Andrew Lloyda Webbera',
      link: 'https://teatr-rozrywki.pl/repertuar/koty.html',
      eventDate: '2026-11-20', // piątek
      description: 'Spektakl / musical w Teatrze Rozrywki w Chorzowie: Koty. Najbliższy termin: 2026-11-20, godz. 18:30. Scena: Teatr Rozrywki w Chorzowie – Duża Scena. Status biletów: Ostatnie wolne miejsca w sprzedaży.',
      ticketStatus: 'Ostatnie wolne miejsca w sprzedaży',
      isEvent: true,
    },
    // Obiekt spoza grupy biletowanej (MCK) -> musi zostać pominięty
    {
      sourceId: '6',
      sourceName: 'MCK Katowice',
      title: 'Targi Książki w MCK',
      link: 'https://www.mckkatowice.pl/pl/wydarzenia/targi.html',
      eventDate: '2026-11-14',
      description: 'Wydarzenie w MCK.',
      isEvent: true,
    },
  ];

  const existingRecords = [
    // Dopasowanie po znormalizowanym sourceUrl (z parametrem śledzącym utm_source i www.)
    {
      file: '2026-11-10-urban-jazz-night-w-nospr.md',
      slug: '2026-11-10-urban-jazz-night-w-nospr',
      title: 'Koncert jazzowy w Katowicach',
      sourceUrl: 'https://www.nospr.org.pl/pl/kalendarz/urban-jazz-night/?utm_source=newsletter',
      eventDate: '2026-11-14',
      status: 'published',
      aiGenerated: true,
    },
    // Dopasowanie po areTitlesSimilar (gdy sourceUrl jest generyczny)
    {
      file: '2026-11-09-tragedyjo-hamleta-ksiyncia-dynymarku-w-teatrze.md',
      title: 'Tragedyjo Hamleta, ksiyncia Dynymarku na Dużej Scenie w Katowicach',
      sourceUrl: 'https://teatrslaski.art.pl/repertuar/',
      eventDate: '2026-11-15',
      status: 'published',
      aiGenerated: true,
    },
    // Szkic (draft) -> NIE powinien dostać linku [nasz artykuł]
    {
      file: '2026-11-10-koty-szkic.md',
      title: 'Koty – musical Andrew Lloyda Webbera',
      sourceUrl: 'https://teatr-rozrywki.pl/repertuar/koty.html',
      eventDate: '2026-11-20',
      status: 'draft',
      aiGenerated: true,
    },
  ];

  const summaryArticle = buildWeeklyVenueSummary(sampleSourceItems, existingRecords, now, DEFAULT_BALANCE_SETTINGS);
  assert.ok(summaryArticle, 'Wpis zbiorczy musi zostać utworzony dla 4 wydarzeń');

  assert.equal(summaryArticle.title, 'Tydzień w kulturze: NOSPR, teatry i Spodek (11.11–25.11)');
  assert.equal(summaryArticle.category, 'kultura');
  assert.equal(summaryArticle.city, 'cala-okolica');
  assert.equal(summaryArticle.status, 'published');
  assert.equal(summaryArticle.eventDate, null);
  assert.equal(summaryArticle.isAlert, false);
  assert.equal(summaryArticle.aiGenerated, true);
  assert.equal(summaryArticle.archived, false);
  assert.equal(summaryArticle.sourceUrl, 'https://nospr.org.pl/pl/kalendarz');
  assert.equal(
    summaryArticle.summary,
    'Zestawienie 4 wydarzeń z dostępnymi biletami w NOSPR, Teatrze Śląskim, Teatrze Rozrywki i Spodku w najbliższych 14 dniach.'
  );

  // Sprawdzenie sekcji i pominięcia pustej sekcji Spodek
  assert.ok(summaryArticle.content.includes('### NOSPR'), 'Treść musi zawierać sekcję ### NOSPR');
  assert.ok(summaryArticle.content.includes('### Teatr Śląski'), 'Treść musi zawierać sekcję ### Teatr Śląski');
  assert.ok(summaryArticle.content.includes('### Teatr Rozrywki'), 'Treść musi zawierać sekcję ### Teatr Rozrywki');
  assert.equal(summaryArticle.content.includes('### Spodek'), false, 'Pusta sekcja ### Spodek musi zostać pominięta');

  // Kolejność sekcji: NOSPR -> Teatr Śląski -> Teatr Rozrywki
  const idxNospr = summaryArticle.content.indexOf('### NOSPR');
  const idxSlaski = summaryArticle.content.indexOf('### Teatr Śląski');
  const idxRozrywki = summaryArticle.content.indexOf('### Teatr Rozrywki');
  assert.ok(idxNospr < idxSlaski && idxSlaski < idxRozrywki, 'Sekcje muszą być w kolejności §6');

  // Sortowanie po dacie wewnątrz sekcji NOSPR (14.11 przed 23.11)
  const idx14 = summaryArticle.content.indexOf('14.11 (sobota), godz. 18:00');
  const idx23 = summaryArticle.content.indexOf('23.11 (poniedziałek), godz. 19:30');
  assert.ok(idx14 !== -1 && idx23 !== -1 && idx14 < idx23, 'Wydarzenia w sekcji muszą być posortowane chronologicznie');

  // Wyróżnienie ⚠️ dla "Ostatnich biletów" i "Ostatnich wolnych miejsc"
  assert.ok(
    summaryArticle.content.includes('⚠️ *Ostatnie bilety w sprzedaży*'),
    'Ostatnie bilety muszą być wyróżnione symbolem ⚠️'
  );
  assert.ok(
    summaryArticle.content.includes('⚠️ *Ostatnie wolne miejsca w sprzedaży*'),
    'Ostatnie wolne miejsca muszą być wyróżnione symbolem ⚠️'
  );

  // Linki do istniejących artykułów (/wpis/<slug>/)
  assert.ok(
    summaryArticle.content.includes('· [nasz artykuł](/wpis/2026-11-10-urban-jazz-night-w-nospr/)'),
    'Wydarzenie dopasowane po normalizeSourceUrl musi mieć link [nasz artykuł](/wpis/<slug>/)'
  );
  assert.ok(
    summaryArticle.content.includes('· [nasz artykuł](/wpis/2026-11-09-tragedyjo-hamleta-ksiyncia-dynymarku-w-teatrze/)'),
    'Wydarzenie dopasowane po areTitlesSimilar musi mieć link [nasz artykuł](/wpis/<slug>/)'
  );
  assert.equal(
    summaryArticle.content.includes('2026-11-10-koty-szkic'),
    false,
    'Nieopublikowany szkic (draft) nie może być linkowany jako nasz artykuł'
  );
}
console.log('✅ Formatowanie sekcji, sortowanie, polskie dni tygodnia, ⚠️ oraz linki [nasz artykuł](/wpis/<slug>/) działają poprawnie.');

// ---------------------------------------------------------------------------
// 4. Wykluczenia z kwot/statystyk, coveredTopics, deduplikacji i puli URL
// ---------------------------------------------------------------------------
console.log('\n--- 4. Wykluczenia wpisu zbiorczego (kwoty, coveredTopics, deduplikacja, selectPromptItems) ---');
{
  const now = new Date('2026-11-11T12:00:00Z');
  const weeklyRecord = {
    file: '2026-11-11-tydzien-w-kulturze-nospr-teatry-i-spodek-11-11-25-.md',
    slug: '2026-11-11-tydzien-w-kulturze-nospr-teatry-i-spodek-11-11-25-',
    addedDate: '2026-11-11',
    publishedDate: '2026-11-11',
    eventDate: null,
    title: 'Tydzień w kulturze: NOSPR, teatry i Spodek (11.11–25.11)',
    summary: 'Zestawienie 12 wydarzeń z dostępnymi biletami w NOSPR, Teatrze Śląskim, Teatrze Rozrywki i Spodku w najbliższych 14 dniach.',
    city: 'cala-okolica',
    category: 'kultura',
    status: 'published',
    location: 'Katowice i Chorzów',
    sourceUrl: 'https://nospr.org.pl/pl/kalendarz',
    aiGenerated: true,
    archived: false,
  };

  assert.equal(isWeeklySummaryRecord(weeklyRecord), true);

  // 4A. Statystyki i budżet równowagi
  const dist = computeRecentDistribution([weeklyRecord], { now });
  assert.equal(dist.today.total, 0, 'Wpis zbiorczy nie może wliczać się do statystyk dziennych');
  assert.equal(dist.last3d.total, 0, 'Wpis zbiorczy nie może wliczać się do statystyk 3-dniowych');
  assert.equal(dist.last7d.total, 0, 'Wpis zbiorczy nie może wliczać się do statystyk 7-dniowych');

  const budget = computeBalanceBudget([weeklyRecord], DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(budget.floorRequired, true, 'Obecność wpisu zbiorczego nie zaspokaja dziennego minimum grupy biletowanej');
  assert.equal(budget.ticketedAllowed, 2, 'Wpis zbiorczy nie zużywa budżetu ticketedAllowed');

  // 4B. coveredTopics
  const covered = buildCoveredTopics([weeklyRecord], { now });
  assert.equal(covered.length, 0, 'Wpis zbiorczy nie może trafić do coveredTopics w prompcie Gemini');

  // 4C. Deduplikacja (isDuplicateArticle / resolveCandidateArticles)
  const candidateArticle = {
    title: 'Tydzień w kulturze: NOSPR, teatry i Spodek – koncert specjalny',
    sourceUrl: 'https://nospr.org.pl/pl/kalendarz/koncert-specjalny',
    eventDate: '2026-11-14',
    status: 'published',
  };
  assert.equal(
    isDuplicateArticle(candidateArticle, weeklyRecord, []),
    '',
    'Wpis zbiorczy nie może blokować artykułów w isDuplicateArticle'
  );
  const resolved = resolveCandidateArticles([candidateArticle], [weeklyRecord], []);
  assert.equal(resolved.length, 1, 'Wpis zbiorczy nie może odrzucać kandydatów w resolveCandidateArticles');

  // 4D. selectPromptItems (brak blokady URL ani cyklu)
  const newsPool = [
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      title: 'JazzKLUB: Koncert w NOSPR',
      link: 'https://nospr.org.pl/pl/kalendarz/jazzklub-1',
      eventDate: '2026-11-15',
      description: 'Wydarzenie w NOSPR.',
    },
  ];
  const selected = selectPromptItems(newsPool, [weeklyRecord], { now });
  assert.equal(selected.length, 1, 'Wpis zbiorczy nie może blokować pozycji w selectPromptItems');
}
console.log('✅ Wykluczenia z kwot, statystyk, coveredTopics, deduplikacji i puli promptu działają bezbłędnie.');

// ---------------------------------------------------------------------------
// 5. Zapis przez writeArticle, walidacja frontmattera ze schematem src/content.config.ts i kompatybilność z archive-worker
// ---------------------------------------------------------------------------
console.log('\n--- 5. Zapis pliku, walidacja Zod (src/content.config.ts) i kompatybilność z archive-worker ---');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kato-weekly-test-'));
  try {
    const now = new Date('2026-11-11T12:00:00Z');
    const items = [
      {
        sourceId: '7',
        sourceName: 'NOSPR (Kalendarz)',
        title: 'Koncert symfoniczny NOSPR',
        link: 'https://nospr.org.pl/pl/kalendarz/symfoniczny',
        eventDate: '2026-11-13',
        description: 'Termin: 2026-11-13, godz. 19:30. Miejsce: NOSPR Katowice, Sala koncertowa. Status biletów: Bilety w sprzedaży.',
        ticketStatus: 'Bilety w sprzedaży',
        isEvent: true,
      },
      {
        sourceId: '10',
        sourceName: 'Teatr Śląski',
        title: 'Empuzjon',
        link: 'https://teatrslaski.art.pl/repertuar/empuzjon/',
        eventDate: '2026-11-15',
        description: 'Najbliższy termin: 2026-11-15, godz. 19:00. Scena: Teatr Śląski – Duża Scena. Status biletów: Bilety w sprzedaży.',
        ticketStatus: 'Bilety w sprzedaży',
        isEvent: true,
      },
      {
        sourceId: '5',
        sourceName: 'Spodek',
        title: 'Widowisko muzyczne w Spodku',
        link: 'https://www.spodekkatowice.pl/pl/wydarzenia/widowisko.html',
        eventDate: '2026-11-21',
        description: 'Wydarzenie w Spodku. Miejsce: Spodek Katowice.',
        ticketStatus: 'Ostatnie bilety w sprzedaży',
        isEvent: true,
      },
    ];

    const summaryArticle = buildWeeklyVenueSummary(items, [], now, DEFAULT_BALANCE_SETTINGS);
    assert.ok(summaryArticle);

    const written = writeArticle(summaryArticle, '2026-11-11', { newsDir: tempDir });
    assert.equal(written, true, 'writeArticle musi zapisać wpis zbiorczy');

    const loaded = loadNewsRecords(tempDir);
    assert.equal(loaded.length, 1);
    const rec = loaded[0];
    assert.ok(rec.file.startsWith('2026-11-11-tydzien-w-kulturze-'), `Nieoczekiwana nazwa pliku: ${rec.file}`);
    assert.equal(isWeeklySummaryRecord(rec), true);
    assert.equal(shouldGenerateWeeklySummary(loaded, now), false, 'Po zapisaniu pliku shouldGenerateWeeklySummary musi zwrócić false');

    // Walidacja zgodności ze schematem Astro (newsSchema w src/content.config.ts)
    const parsedSchema = newsSchema.safeParse({
      title: rec.title,
      publishedDate: rec.publishedDate,
      eventDate: rec.eventDate ? rec.eventDate : null,
      city: 'cala-okolica',
      category: rec.category,
      status: rec.status,
      summary: rec.summary,
      location: rec.location,
      isAlert: false,
      isForKids: false,
      sourceUrl: rec.sourceUrl,
      aiGenerated: rec.aiGenerated,
      archived: rec.archived,
    });
    assert.equal(
      parsedSchema.success,
      true,
      `Frontmatter wpisu zbiorczego musi przechodzić walidację newsSchema: ${JSON.stringify(parsedSchema.error?.issues)}`
    );

    // Sprawdzenie, że validateArticle nie nadpisuje category: 'kultura' na 'nospr'
    const validatedCopy = validateArticle({ ...summaryArticle }, items, now);
    assert.equal(validatedCopy.category, 'kultura', 'validateArticle musi zachować kategorię kultura dla wpisu zbiorczego');
    assert.equal(validatedCopy.eventDate, null, 'validateArticle musi zachować eventDate: null dla wpisu zbiorczego');

    // Sprawdzenie kompatybilności z nocnym workerem archiwizacji (resolveArticlePublishedDate)
    const rawFile = fs.readFileSync(rec.filePath, 'utf8');
    const fmMatch = rawFile.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(fmMatch);
    const readField = (name) => {
      const m = fmMatch[1].match(new RegExp(`^${name}\\s*:\\s*(.*)$`, 'm'));
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
    };
    const workerPubDate = resolveArticlePublishedDate(readField);
    assert.equal(workerPubDate, '2026-11-11', 'Worker archiwizacji musi poprawnie odczytać publishedDate wpisu zbiorczego');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
console.log('✅ Frontmatter jest w pełni zgodny z src/content.config.ts oraz kompatybilny z nocnym workerem archiwizacji.');

console.log('\n======================================================');
console.log('🎉 Wszystkie testy wpisu zbiorczego „Tydzień w kulturze” zakończone sukcesem!');
console.log('======================================================\n');
