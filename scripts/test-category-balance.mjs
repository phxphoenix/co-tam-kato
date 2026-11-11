import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BALANCE_SETTINGS,
  parseBalanceSettings,
  validateBalanceSettings,
  serializeSourcesMarkdown,
  serializePaginationSettingsInMarkdown,
  parseSourcesMarkdown,
} from './sources-parser.mjs';
import {
  MAX_ARTICLES,
  MAX_CANDIDATES,
  getVenueGroup,
  isWeeklySummaryRecord,
  computeRecentDistribution,
  isUrgentCandidate,
  computeBalanceBudget,
  selectBalancedArticles,
  formatBalanceSummary,
  loadNewsRecords,
} from './daily-digest.mjs';
import {
  updateSource,
  updatePaginationSettings,
} from '../src/server/sources-service.ts';

console.log('\n======================================================');
console.log('🧪 Testy równowagi kategorii (kwoty, minimum, bonus urgent, replay)');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
// 1. Parser ustawień równowagi (DEFAULT_BALANCE_SETTINGS, parseBalanceSettings, validateBalanceSettings)
//    oraz round-trip zapisu źródeł i paginacji
// ---------------------------------------------------------------------------
console.log('--- 1. Parser ustawień równowagi i round-trip zapisu config/sources.md ---');
{
  assert.equal(MAX_ARTICLES, 4, 'MAX_ARTICLES musi wynosić 4');
  assert.equal(MAX_CANDIDATES, 7, 'MAX_CANDIDATES musi wynosić 7');

  const parsedFromFile = parseBalanceSettings();
  assert.deepEqual(
    parsedFromFile,
    DEFAULT_BALANCE_SETTINGS,
    'Domyślne ustawienia w config/sources.md muszą odpowiadać DEFAULT_BALANCE_SETTINGS'
  );

  // Własny fragment markdown
  const customMd = `
## Ustawienia równowagi treści (Agent AI)

- \`ticketedMaxPerRun\`: 1
- \`ticketedMaxPerDay\`: 2
- \`ticketedMinPerDay\`: 1
- \`ticketedMaxShare3d\`: 0.35
- \`nosprMaxPerRun\`: 1
- \`nosprMaxPerDay\`: 1
- \`otherVenueMaxPerDay\`: 1
- \`lastTicketsBonusPerDay\`: 2
- \`maxCandidates\`: 8
- \`poolMaxItemsPerTicketedSource\`: 4
- \`cycleCooldownDays\`: 10
- \`weeklySummaryEnabled\`: false
- \`weeklySummaryHorizonDays\`: 21
`;
  const customParsed = parseBalanceSettings(customMd);
  assert.equal(customParsed.ticketedMaxPerRun, 1);
  assert.equal(customParsed.ticketedMaxPerDay, 2);
  assert.equal(customParsed.ticketedMaxShare3d, 0.35);
  assert.equal(customParsed.lastTicketsBonusPerDay, 2);
  assert.equal(customParsed.maxCandidates, 8);
  assert.equal(customParsed.weeklySummaryEnabled, false);
  assert.equal(customParsed.weeklySummaryHorizonDays, 21);

  // Walidacja błędnych i brakujących wartości -> domyślne + ostrzeżenie
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const brokenMd = `
## Ustawienia równowagi treści (Agent AI)
- \`ticketedMaxPerRun\`: -2
- \`ticketedMaxPerDay\`: 2.5
- \`ticketedMaxShare3d\`: 1.5
- \`nosprMaxPerRun\`: abc
- \`weeklySummaryEnabled\`: moze
`;
    const fallbackSettings = parseBalanceSettings(brokenMd);
    assert.deepEqual(
      fallbackSettings,
      DEFAULT_BALANCE_SETTINGS,
      'Wszystkie błędne i brakujące pola muszą zostać zastąpione przez DEFAULT_BALANCE_SETTINGS'
    );
    assert.ok(warnings.length >= 5, 'Dla błędnych i brakujących wartości muszą pojawić się ostrzeżenia w logu');

    warnings.length = 0;
    const validatedDirect = validateBalanceSettings({
      ...DEFAULT_BALANCE_SETTINGS,
      ticketedMaxShare3d: -0.1,
      otherVenueMaxPerDay: -1,
    });
    assert.equal(validatedDirect.ticketedMaxShare3d, DEFAULT_BALANCE_SETTINGS.ticketedMaxShare3d);
    assert.equal(validatedDirect.otherVenueMaxPerDay, DEFAULT_BALANCE_SETTINGS.otherVenueMaxPerDay);
    assert.equal(warnings.length, 2);
  } finally {
    console.warn = origWarn;
  }

  // Round-trip: zapis tabeli źródeł i paginacji z panelu admina musi zachować sekcję równowagi
  const originalSourcesMd = fs.readFileSync('config/sources.md', 'utf8');
  try {
    const allSources = parseSourcesMarkdown(originalSourcesMd);
    const reserializedSources = serializeSourcesMarkdown(allSources, originalSourcesMd);
    assert.equal(reserializedSources, originalSourcesMd, 'serializeSourcesMarkdown musi zachować cały plik bez zmian');

    const updatedPagMd = serializePaginationSettingsInMarkdown(originalSourcesMd, {
      homePageSize: 24,
      archivePageSize: 48,
      adminArchivePageSize: 50,
    });
    assert.ok(
      updatedPagMd.includes('## Ustawienia równowagi treści (Agent AI)'),
      'Zapis paginacji musi zachować nagłówek sekcji równowagi'
    );
    assert.deepEqual(
      parseBalanceSettings(updatedPagMd),
      DEFAULT_BALANCE_SETTINGS,
      'Zapis paginacji nie może zmienić żadnego parametru równowagi'
    );

    // Test przez sources-service.ts (updatePaginationSettings + updateSource)
    const pagRes = updatePaginationSettings({ homePageSize: 20, archivePageSize: 36, adminArchivePageSize: 100 });
    assert.ok(pagRes.success);
    const srcRes = updateSource({ id: '1', name: 'PIK Katowice (Roundtrip)' });
    assert.ok(srcRes.success);

    const afterServiceMd = fs.readFileSync('config/sources.md', 'utf8');
    assert.ok(afterServiceMd.includes('## Ustawienia równowagi treści (Agent AI)'));
    assert.deepEqual(parseBalanceSettings(afterServiceMd), DEFAULT_BALANCE_SETTINGS);
  } finally {
    fs.writeFileSync('config/sources.md', originalSourcesMd, 'utf8');
  }
}
console.log('✅ Parser ustawień równowagi, walidacja błędnych wartości oraz round-trip zapisu działają poprawnie.');

// ---------------------------------------------------------------------------
// 2. loadNewsRecords (nowe pola) oraz isWeeklySummaryRecord i computeRecentDistribution
// ---------------------------------------------------------------------------
console.log('\n--- 2. loadNewsRecords, isWeeklySummaryRecord i computeRecentDistribution ---');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kato-balance-test-'));
  try {
    fs.writeFileSync(
      path.join(tempDir, '2026-11-10-koncert-w-nospr.md'),
      [
        '---',
        'title: "Koncert symfoniczny w NOSPR"',
        'publishedDate: 2026-10-25',
        'eventDate: 2026-11-20',
        'city: "katowice"',
        'category: "nospr"',
        'status: "published"',
        'summary: "Opis"',
        'location: "NOSPR Katowice"',
        'sourceUrl: "https://nospr.org.pl/pl/kalendarz/koncert-1"',
        'aiGenerated: true',
        'archived: false',
        '---',
        '',
        'Treść.',
      ].join('\n'),
      'utf8'
    );

    fs.writeFileSync(
      path.join(tempDir, '2026-11-11-tydzien-w-kulturze-nospr-teatry-i-spodek.md'),
      [
        '---',
        'title: "Tydzień w kulturze: NOSPR, teatry i Spodek (11.11–25.11)"',
        'publishedDate: 2026-11-11',
        'eventDate: null',
        'city: "cala-okolica"',
        'category: "kultura"',
        'status: "published"',
        'summary: "Zestawienie wydarzeń"',
        'location: "Katowice"',
        'sourceUrl: "https://nospr.org.pl/pl/kalendarz"',
        'aiGenerated: true',
        'archived: false',
        '---',
        '',
        'Lista.',
      ].join('\n'),
      'utf8'
    );

    const records = loadNewsRecords(tempDir);
    assert.equal(records.length, 2);

    const nosprRec = records.find((r) => r.file.includes('koncert-w-nospr'));
    assert.equal(nosprRec.category, 'nospr');
    assert.equal(nosprRec.location, 'NOSPR Katowice');
    assert.equal(nosprRec.aiGenerated, true);
    assert.equal(nosprRec.addedDate, '2026-11-10', 'addedDate musi być prefiksem pliku, niezależnie od publishedDate');
    assert.equal(isWeeklySummaryRecord(nosprRec), false);

    const weeklyRec = records.find((r) => r.file.includes('tydzien-w-kulturze'));
    assert.equal(isWeeklySummaryRecord(weeklyRec), true, 'Wpis ze slugiem tydzien-w-kulturze musi być rozpoznany jako zbiorczy');

    // Dodatkowe rekordy do testu rozkładu (usunięty, ręczny aiGenerated:false, dzisiejszy other, sprzed 5 dni spodek)
    const allTestRecords = [
      ...records,
      {
        file: '2026-11-11-remont-drogi.md',
        addedDate: '2026-11-11',
        category: 'drogi-komunikacja',
        location: 'Katowice',
        sourceUrl: 'https://mojekatowice.pl/remont',
        aiGenerated: true,
        status: 'published',
      },
      {
        file: '2026-11-11-usuniety-nospr.md',
        addedDate: '2026-11-11',
        category: 'nospr',
        location: 'NOSPR',
        sourceUrl: 'https://nospr.org.pl/pl/kalendarz/del',
        aiGenerated: true,
        status: 'deleted',
      },
      {
        file: '2026-11-11-reczny-wpis-nospr.md',
        addedDate: '2026-11-11',
        category: 'nospr',
        location: 'NOSPR',
        sourceUrl: 'https://nospr.org.pl/pl/kalendarz/manual',
        aiGenerated: false,
        status: 'published',
      },
      {
        file: '2026-11-06-widowisko-spodek.md',
        addedDate: '2026-11-06',
        category: 'spodek',
        location: 'Spodek Katowice',
        sourceUrl: 'https://www.spodekkatowice.pl/pl/wydarzenia/1',
        aiGenerated: true,
        status: 'published',
      },
    ];

    const dist = computeRecentDistribution(allTestRecords, { now: new Date('2026-11-11T12:00:00Z') });
    // Dziś (2026-11-11): tylko remont-drogi (tydzien-w-kulturze, deleted i aiGenerated:false są wykluczone!)
    assert.equal(dist.today.total, 1);
    assert.equal(dist.today.ticketed, 0);
    assert.equal(dist.today.other, 1);
    // 3 dni (09..11.11): remont-drogi (11.11) + koncert-w-nospr (10.11)
    assert.equal(dist.last3d.total, 2);
    assert.equal(dist.last3d.ticketed, 1);
    assert.equal(dist.last3d.nospr, 1);
    // 7 dni (05..11.11): dochodzi widowisko-spodek (06.11)
    assert.equal(dist.last7d.total, 3);
    assert.equal(dist.last7d.ticketed, 2);
    assert.equal(dist.last7d.spodek, 1);
    assert.equal(dist.byCategory7d['drogi-komunikacja'], 1);
    assert.equal(dist.byCategory7d.nospr, 1);
    assert.equal(dist.byCategory7d.spodek, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
console.log('✅ loadNewsRecords, wykluczenie wpisu zbiorczego oraz computeRecentDistribution działają poprawnie.');

// ---------------------------------------------------------------------------
// 3. isUrgentCandidate (§1)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Klasyfikacja kandydata pilnego (isUrgentCandidate) ---');
{
  const now = new Date('2026-11-11T12:00:00Z');

  // 1. NOSPR + "Ostatnie bilety" + eventDate za 5 dni -> true
  assert.equal(
    isUrgentCandidate(
      {
        title: 'Koncert kameralny',
        sourceUrl: 'https://nospr.org.pl/pl/kalendarz/koncert',
        eventDate: '2026-11-16',
      },
      {
        link: 'https://nospr.org.pl/pl/kalendarz/koncert',
        ticketStatus: 'Ostatnie bilety w sprzedaży',
        eventDate: '2026-11-16',
      },
      now
    ),
    true
  );

  // 2. Teatr Rozrywki + "Ostatnie wolne miejsca" + eventDate dokładnie za 14 dni -> true
  assert.equal(
    isUrgentCandidate(
      {
        title: 'Musical w Chorzowie',
        sourceUrl: 'https://teatr-rozrywki.pl/repertuar/1.html',
        eventDate: '2026-11-25',
      },
      {
        link: 'https://teatr-rozrywki.pl/repertuar/1.html',
        description: 'Spektakl. Status biletów: Ostatnie wolne miejsca w sprzedaży.',
      },
      now
    ),
    true
  );

  // 3. Wydarzenie za 15 dni (> 14 dni) -> false
  assert.equal(
    isUrgentCandidate(
      {
        title: 'Koncert w grudniu',
        sourceUrl: 'https://nospr.org.pl/pl/kalendarz/grudzien',
        eventDate: '2026-11-26',
      },
      {
        ticketStatus: 'Ostatnie bilety w sprzedaży',
      },
      now
    ),
    false
  );

  // 4. Zwykły status "Bilety w sprzedaży" -> false
  assert.equal(
    isUrgentCandidate(
      {
        title: 'Koncert w NOSPR',
        sourceUrl: 'https://nospr.org.pl/pl/kalendarz/zwykly',
        eventDate: '2026-11-15',
      },
      {
        ticketStatus: 'Bilety w sprzedaży',
      },
      now
    ),
    false
  );

  // 5. Obiekt spoza grupy biletowanej (other) -> false
  assert.equal(
    isUrgentCandidate(
      {
        title: 'Koncert w Rialto',
        sourceUrl: 'https://kinoteatrrialto.bilety24.pl/1',
        location: 'Kinoteatr Rialto',
        eventDate: '2026-11-15',
      },
      {
        ticketStatus: 'Ostatnie bilety w sprzedaży',
      },
      now
    ),
    false
  );
}
console.log('✅ isUrgentCandidate poprawnie weryfikuje grupę biletowaną, status ostatnich biletów i horyzont <= 14 dni.');

// ---------------------------------------------------------------------------
// 4. Algorytm budżetu computeBalanceBudget (§3)
// ---------------------------------------------------------------------------
console.log('\n--- 4. Algorytm budżetu (computeBalanceBudget) ---');
{
  const now = new Date('2026-11-11T12:00:00Z');

  // 4A. Pusty dzień -> floorRequired = true, ticketedAllowed = 2, nosprAllowed = 1, obiekty = 1
  const emptyBudget = computeBalanceBudget([], DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(emptyBudget.floorRequired, true);
  assert.equal(emptyBudget.ticketedAllowed, 2);
  assert.equal(emptyBudget.nosprAllowed, 1);
  assert.deepEqual(emptyBudget.perVenueAllowed, {
    'teatr-slaski': 1,
    'teatr-rozrywki': 1,
    spodek: 1,
  });
  assert.equal(emptyBudget.urgentBonusAvailable, 1);

  // 4B. Dziś już 2 artykuły ticketed (1 nospr, 1 spodek), a udział 3d niski (2/10 = 20%)
  const recordsLowShare = [
    { addedDate: '2026-11-11', category: 'nospr', sourceUrl: 'https://nospr.org.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-11', category: 'spodek', sourceUrl: 'https://spodekkatowice.pl/1', aiGenerated: true, status: 'published' },
    ...Array.from({ length: 8 }, (_, i) => ({
      addedDate: '2026-11-10',
      category: 'wydarzenia',
      sourceUrl: `https://mojekatowice.pl/${i}`,
      aiGenerated: true,
      status: 'published',
    })),
  ];
  const budgetAfterTwo = computeBalanceBudget(recordsLowShare, DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(budgetAfterTwo.floorRequired, false);
  assert.equal(budgetAfterTwo.ticketedAllowed, 1, 'Pozostał 1 slot do dziennego limitu 3');
  assert.equal(budgetAfterTwo.nosprAllowed, 1, 'NOSPR ma dziś 1/2, więc jeszcze 1 dozwolony');
  assert.equal(budgetAfterTwo.perVenueAllowed.spodek, 0, 'Spodek osiągnął dzienny limit 1/1');
  assert.equal(budgetAfterTwo.perVenueAllowed['teatr-slaski'], 1);

  // 4C. Próg udziału 3d przekroczony (> 40%) i dziś już >= 1 ticketed -> ticketedAllowed = 0
  const recordsHighShare = [
    { addedDate: '2026-11-11', category: 'nospr', sourceUrl: 'https://nospr.org.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-10', category: 'nospr', sourceUrl: 'https://nospr.org.pl/2', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-10', category: 'teatr-slaski', sourceUrl: 'https://teatrslaski.art.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-09', category: 'wydarzenia', sourceUrl: 'https://mojekatowice.pl/1', aiGenerated: true, status: 'published' },
  ]; // 3/4 = 75% > 40%, dziś = 1
  const budgetCappedByShare = computeBalanceBudget(recordsHighShare, DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(budgetCappedByShare.floorRequired, false);
  assert.equal(budgetCappedByShare.ticketedAllowed, 0, 'Przekroczony próg 3d przy today.ticketed >= 1 musi wyzerować ticketedAllowed');
  assert.equal(budgetCappedByShare.nosprAllowed, 0);
  assert.equal(budgetCappedByShare.urgentBonusAvailable, 1);

  // 4D. Próg udziału 3d przekroczony (> 40%), ale floorRequired aktywne:
  // - gdy today.ticketed === 0 (domyślne ticketedMinPerDay=1): krok 4 nie zeruje (bo today.ticketed < 1), floorRequired = true, ticketedAllowed = 2
  // - gdy ticketedMinPerDay = 2 i today.ticketed === 1: krok 4 zeruje do 0, a krok 5 (floorRequired) podnosi max(0, 1) = 1
  const recordsHighShareZeroToday = [
    { addedDate: '2026-11-10', category: 'nospr', sourceUrl: 'https://nospr.org.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-10', category: 'spodek', sourceUrl: 'https://spodekkatowice.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-09', category: 'teatr-slaski', sourceUrl: 'https://teatrslaski.art.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-09', category: 'wydarzenia', sourceUrl: 'https://mojekatowice.pl/1', aiGenerated: true, status: 'published' },
  ]; // 3/4 = 75% > 40%, dziś = 0
  const budgetFloorOverride = computeBalanceBudget(recordsHighShareZeroToday, DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(budgetFloorOverride.floorRequired, true);
  assert.equal(budgetFloorOverride.ticketedAllowed, 2);
  assert.equal(budgetFloorOverride.nosprAllowed, 1);

  const budgetFloorMin2 = computeBalanceBudget(
    recordsHighShare,
    { ...DEFAULT_BALANCE_SETTINGS, ticketedMinPerDay: 2 },
    now
  );
  assert.equal(budgetFloorMin2.floorRequired, true);
  assert.equal(
    budgetFloorMin2.ticketedAllowed,
    1,
    'Gdy krok 4 wyzerował ticketedAllowed, a floorRequired=true (today=1 < min=2), krok 5 podnosi ticketedAllowed do 1'
  );

  // 4E. Gdy wszystkich z 3 dni < 4 (np. 2/2 = 100%, w tym 1 dziś), próg udziału 3d jest ignorowany
  const recordsFew3d = [
    { addedDate: '2026-11-11', category: 'nospr', sourceUrl: 'https://nospr.org.pl/1', aiGenerated: true, status: 'published' },
    { addedDate: '2026-11-10', category: 'spodek', sourceUrl: 'https://spodekkatowice.pl/1', aiGenerated: true, status: 'published' },
  ];
  const budgetFew3d = computeBalanceBudget(recordsFew3d, DEFAULT_BALANCE_SETTINGS, now);
  assert.equal(budgetFew3d.ticketedAllowed, 2, 'Przy < 4 wpisach w 3 dniach próg udziału 3d nie blokuje budżetu');
}
console.log('✅ computeBalanceBudget bezbłędnie wylicza limity, próg 3d oraz minimum dzienne.');

// ---------------------------------------------------------------------------
// 5. Wybór artykułów selectBalancedArticles (§4): limity, minimum (zamiana), bonus urgent, brak dopychania
// ---------------------------------------------------------------------------
console.log('\n--- 5. Wybór artykułów (selectBalancedArticles) ---');
{
  const now = new Date('2026-11-11T12:00:00Z');

  // 5A. Limity per uruchomienie i per obiekt (maks. 2 ticketed, maks. 1 NOSPR w uruchomieniu)
  const budgetOpen = computeBalanceBudget([], DEFAULT_BALANCE_SETTINGS, now);
  const candidatesMix = [
    { title: 'NOSPR #1', sourceUrl: 'https://nospr.org.pl/pl/kalendarz/1', category: 'nospr' },
    { title: 'NOSPR #2 (nadmiar NOSPR)', sourceUrl: 'https://nospr.org.pl/pl/kalendarz/2', category: 'nospr' },
    { title: 'Teatr Śląski #1', sourceUrl: 'https://teatrslaski.art.pl/repertuar/1', category: 'teatr-slaski' },
    { title: 'Spodek #1 (trzeci ticketed w runie)', sourceUrl: 'https://spodekkatowice.pl/pl/wydarzenia/1', category: 'spodek' },
    { title: 'Miejski #1', sourceUrl: 'https://mojekatowice.pl/1', category: 'wydarzenia' },
    { title: 'Miejski #2', sourceUrl: 'https://mojekatowice.pl/2', category: 'drogi-komunikacja' },
  ];
  const resMix = selectBalancedArticles(candidatesMix, budgetOpen, DEFAULT_BALANCE_SETTINGS, { now });
  assert.equal(resMix.accepted.length, 4);
  assert.deepEqual(
    resMix.accepted.map((a) => a.title),
    ['NOSPR #1', 'Teatr Śląski #1', 'Miejski #1', 'Miejski #2'],
    'Powinny przejść: 1x NOSPR, 1x Teatr Śląski (razem 2 ticketed) oraz 2x other'
  );
  assert.equal(resMix.rejected.length, 2);
  assert.ok(resMix.rejected[0].reason.includes('nospr'));
  assert.ok(resMix.rejected[1].reason.includes('spodek'));

  // 5B. Minimum dzienne (zamiana ostatniego other na ticketed, z priorytetem dla urgent)
  const candidatesFourOtherFirst = [
    { title: 'Other #1', sourceUrl: 'https://mojekatowice.pl/1', category: 'wydarzenia' },
    { title: 'Other #2', sourceUrl: 'https://mojekatowice.pl/2', category: 'sport' },
    { title: 'Other #3', sourceUrl: 'https://mojekatowice.pl/3', category: 'dla-dzieci' },
    { title: 'Other #4 (do zamiany)', sourceUrl: 'https://mojekatowice.pl/4', category: 'kultura' },
    { title: 'NOSPR zwykły #5', sourceUrl: 'https://nospr.org.pl/pl/kalendarz/5', category: 'nospr', eventDate: '2026-12-20' },
    {
      title: 'Teatr Śląski URGENT #6',
      sourceUrl: 'https://teatrslaski.art.pl/repertuar/6',
      category: 'teatr-slaski',
      eventDate: '2026-11-15',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
  ];
  const resSwap = selectBalancedArticles(candidatesFourOtherFirst, budgetOpen, DEFAULT_BALANCE_SETTINGS, { now });
  assert.equal(resSwap.accepted.length, 4);
  assert.deepEqual(
    resSwap.accepted.map((a) => a.title),
    ['Other #1', 'Other #2', 'Other #3', 'Teatr Śląski URGENT #6'],
    'Ostatni zaakceptowany other (#4) musi zostać zamieniony na pilnego kandydata ticketed (#6)'
  );
  assert.ok(
    resSwap.rejected.some((r) => r.article.title === 'Other #4 (do zamiany)'),
    'Wycofany artykuł other #4 musi znaleźć się na liście rejected'
  );

  // 5C. Bonus urgent przekracza wyczerpany budżet dzienny (gdy urgentBonusAvailable > 0)
  const budgetZeroAllowedWithBonus = {
    ticketedAllowed: 0,
    nosprAllowed: 0,
    perVenueAllowed: { 'teatr-slaski': 0, 'teatr-rozrywki': 0, spodek: 0 },
    floorRequired: false,
    urgentBonusAvailable: 1,
  };
  const candidatesWithUrgent = [
    { title: 'NOSPR zwykły (odrzucony)', sourceUrl: 'https://nospr.org.pl/pl/kalendarz/10', category: 'nospr', eventDate: '2026-12-10' },
    {
      title: 'NOSPR Ostatnie bilety (bonus)',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/11',
      category: 'nospr',
      eventDate: '2026-11-18',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
    { title: 'Other #1', sourceUrl: 'https://mojekatowice.pl/10', category: 'wydarzenia' },
  ];
  const resBonus = selectBalancedArticles(
    candidatesWithUrgent,
    budgetZeroAllowedWithBonus,
    DEFAULT_BALANCE_SETTINGS,
    { now }
  );
  assert.deepEqual(
    resBonus.accepted.map((a) => a.title),
    ['NOSPR Ostatnie bilety (bonus)', 'Other #1'],
    'Kandydat urgent musi przejść w ramach bonusu mimo ticketedAllowed=0'
  );

  // 5D. Brak dopychania: gdy po pętli < 4 artykułów, a zostali wyłącznie kandydaci ticketed ponad limit -> publikuj mniej (< 4)
  const budgetOnlyOneTicketed = {
    ticketedAllowed: 1,
    nosprAllowed: 1,
    perVenueAllowed: { 'teatr-slaski': 1, 'teatr-rozrywki': 1, spodek: 1 },
    floorRequired: false,
    urgentBonusAvailable: 0,
  };
  const candidatesMostlyTicketed = [
    { title: 'NOSPR #1', sourceUrl: 'https://nospr.org.pl/pl/kalendarz/1', category: 'nospr', eventDate: '2026-12-05' },
    { title: 'Teatr Śląski #1 (ponad limit)', sourceUrl: 'https://teatrslaski.art.pl/repertuar/1', category: 'teatr-slaski', eventDate: '2026-12-06' },
    { title: 'Spodek #1 (ponad limit)', sourceUrl: 'https://spodekkatowice.pl/pl/wydarzenia/1', category: 'spodek', eventDate: '2026-12-07' },
    { title: 'Other #1', sourceUrl: 'https://mojekatowice.pl/1', category: 'wydarzenia' },
  ];
  const resNoBackfill = selectBalancedArticles(
    candidatesMostlyTicketed,
    budgetOnlyOneTicketed,
    DEFAULT_BALANCE_SETTINGS,
    { now }
  );
  assert.equal(
    resNoBackfill.accepted.length,
    2,
    'Brak dopychania: nie wolno przekraczać limitu ticketed nawet gdy zaakceptowano mniej niż 4 artykuły'
  );
  assert.deepEqual(resNoBackfill.accepted.map((a) => a.title), ['NOSPR #1', 'Other #1']);
}
console.log('✅ selectBalancedArticles poprawnie egzekwuje limity, minimum przez zamianę, bonus urgent i zakaz dopychania.');

// ---------------------------------------------------------------------------
// 6. REPLAY HISTORYCZNY (§9 pkt 2) z pliku scripts/fixtures/balance-replay.json
// ---------------------------------------------------------------------------
console.log('\n--- 6. Replay historyczny 01–11.11.2026 (scripts/fixtures/balance-replay.json) ---');
{
  const fixturePath = path.resolve('scripts/fixtures/balance-replay.json');
  assert.ok(fs.existsSync(fixturePath), 'Plik fixture scripts/fixtures/balance-replay.json musi istnieć');

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.ok(Array.isArray(fixture.runs) && fixture.runs.length >= 26, 'Fixture musi zawierać co najmniej 26 uruchomień');

  const publishedHistory = [];
  const origLog = console.log;
  console.log = () => {};
  try {
    for (const run of fixture.runs) {
      const now = new Date(run.commitTimestamp);
      const budget = computeBalanceBudget(publishedHistory, DEFAULT_BALANCE_SETTINGS, now);
      const { accepted } = selectBalancedArticles(run.candidates, budget, DEFAULT_BALANCE_SETTINGS, { now });
      for (const art of accepted) {
        publishedHistory.push({
          ...art,
          addedDate: run.date,
          aiGenerated: true,
          status: 'published',
        });
      }
    }
  } finally {
    console.log = origLog;
  }

  const totalArticles = publishedHistory.length;
  const ticketedArticles = publishedHistory.filter((a) => getVenueGroup(a) !== 'other').length;
  const nosprArticles = publishedHistory.filter((a) => getVenueGroup(a) === 'nospr').length;

  const ticketedShare = ticketedArticles / totalArticles;
  const nosprShare = nosprArticles / totalArticles;

  const byDay = new Map();
  for (const art of publishedHistory) {
    if (!byDay.has(art.addedDate)) {
      byDay.set(art.addedDate, { total: 0, ticketed: 0, nospr: 0 });
    }
    const dayStats = byDay.get(art.addedDate);
    dayStats.total += 1;
    if (getVenueGroup(art) !== 'other') dayStats.ticketed += 1;
    if (getVenueGroup(art) === 'nospr') dayStats.nospr += 1;
  }

  console.log(
    `📊 Wynik Replay (${fixture.runs.length} uruchomień, ${byDay.size} dni): ` +
    `łącznie=${totalArticles}, ticketed=${ticketedArticles}/${totalArticles} (${(ticketedShare * 100).toFixed(1)}%), ` +
    `NOSPR=${nosprArticles}/${totalArticles} (${(nosprShare * 100).toFixed(1)}%)`
  );

  assert.ok(
    ticketedShare >= 0.30 && ticketedShare <= 0.40,
    `Udział grupy biletowanej w replay musi mieścić się w przedziale 30–40%, otrzymano ${(ticketedShare * 100).toFixed(2)}%`
  );
  assert.ok(
    nosprShare <= 0.20,
    `Udział NOSPR w replay musi wynosić <= 20%, otrzymano ${(nosprShare * 100).toFixed(2)}%`
  );

  for (const [day, stats] of byDay.entries()) {
    assert.ok(
      stats.ticketed >= 1,
      `Każdy dzień w replayu musi mieć >= 1 artykuł z grupy biletowanej (dzień ${day} ma ${stats.ticketed})`
    );
  }
}
console.log('✅ Replay historyczny spełnia wszystkie kryteria akceptacji (ticketed 30–40%, NOSPR <= 20%, każdy dzień >= 1 ticketed).');

console.log('\n🎉 Wszystkie testy równowagi kategorii zakończone pełnym sukcesem!\n');
