import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  CYCLIC_TOPIC_COOLDOWN_DAYS,
  MAX_PROMPT_ITEMS,
  normalizeTitle,
  normalizeSourceUrl,
  buildGenericSourceUrls,
  isGenericSourceUrl,
  areTitlesSimilar,
  articleSourceTitles,
  isDuplicateArticle,
  matchesDeletedArticle,
  resolveCandidateArticles,
  selectPromptItems,
  buildCoveredTopics,
  loadNewsRecords,
  writeArticle,
} from './daily-digest.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja wykrywania duplikatów i selekcji źródeł (Agent AI)');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
// 1. Normalizacja polskich znaków (w tym litery 'ł') w normalizeTitle
// ---------------------------------------------------------------------------
console.log('--- 1. Normalizacja polskich znaków (w tym litery ł) ---');

assert.equal(
  normalizeTitle('Paweł Domagała w Teatrze Małym – Główne szczegóły Śląskie'),
  'pawel domagala w teatrze malym glowne szczegoly slaskie',
  'Litera ł musi być zamieniana na l, a nie rozrywać wyrazy spacją'
);
assert.equal(
  areTitlesSimilar(
    'Mikołajki w Teatrze Małym w Tychach – spektakle dla dzieci',
    'Mikołajki w Teatrze Małym w Tychach: spektakle i spotkanie'
  ),
  true,
  'Podobne polskie tytuły z literą ł muszą być poprawnie rozpoznawane'
);
console.log('✅ Normalizacja polskich znaków (ł -> l) działa poprawnie.');

// ---------------------------------------------------------------------------
// 2. Brak fałszywych kolizji na syntetycznych tytułach discoveredLinks
// ---------------------------------------------------------------------------
console.log('\n--- 2. Brak zatruwania articleSourceTitles syntetycznym tytułem "Źródło – szczegóły" ---');

{
  const pikSourceItems = [
    {
      title: 'PIK Katowice (Główne) – Nadchodzące wydarzenia',
      link: 'https://pik.katowice.pl/',
      sourceId: '1',
      sourceName: 'PIK Katowice (Główne)',
      sourceType: 'WEB',
      isSyntheticContainer: true,
    },
    {
      title: 'PIK Katowice (Główne) – szczegóły',
      link: 'https://pik.katowice.pl/pawel-domagala-koncert-slask/',
      sourceId: '1',
      sourceName: 'PIK Katowice (Główne)',
      sourceType: 'WEB',
      isDiscoveredLinkOnly: true,
    },
    {
      title: 'PIK Katowice (Główne) – szczegóły',
      link: 'https://pik.katowice.pl/sylwester-w-teatrze-korez/',
      sourceId: '1',
      sourceName: 'PIK Katowice (Główne)',
      sourceType: 'WEB',
      isDiscoveredLinkOnly: true,
    },
    {
      title: 'PIK Katowice (Główne) – szczegóły',
      link: 'https://pik.katowice.pl/sylwester-w-mck/',
      sourceId: '1',
      sourceName: 'PIK Katowice (Główne)',
      sourceType: 'WEB',
      isDiscoveredLinkOnly: true,
    },
    {
      title: 'PIK Katowice (Główne) – szczegóły',
      link: 'https://pik.katowice.pl/sylwester-w-teatrze-malym-w-tychach/',
      sourceId: '1',
      sourceName: 'PIK Katowice (Główne)',
      sourceType: 'WEB',
      isDiscoveredLinkOnly: true,
    },
  ];

  const existingDomagala = {
    title: 'Paweł Domagała – Trasa koncertowa „Nadzieja”',
    sourceUrl: 'https://pik.katowice.pl/pawel-domagala-koncert-slask/',
    publishedDate: '2026-10-23',
    eventDate: '2026-11-28',
    status: 'published',
    archived: false,
  };

  const candidates = [
    {
      title: 'Marcin Daniec – One Man Show – Sylwester w MCK',
      sourceUrl: 'https://pik.katowice.pl/sylwester-w-mck/',
      publishedDate: '2026-10-25',
      eventDate: '2026-12-31',
      status: 'published',
    },
    {
      title: 'Sylwester w Teatrze Korez: „Weltmajstry”',
      sourceUrl: 'https://pik.katowice.pl/sylwester-w-teatrze-korez/',
      publishedDate: '2026-10-25',
      eventDate: '2026-12-31',
      status: 'published',
    },
    {
      title: 'Mumio – Sylwester w Teatrze Małym w Tychach',
      sourceUrl: 'https://pik.katowice.pl/sylwester-w-teatrze-malym-w-tychach/',
      publishedDate: '2026-10-25',
      eventDate: '2026-12-31',
      status: 'published',
    },
  ];

  assert.deepEqual(
    articleSourceTitles(existingDomagala, pikSourceItems),
    ['Paweł Domagała – Trasa koncertowa „Nadzieja”'],
    'Syntetyczny tytuł "PIK Katowice (Główne) – szczegóły" NIE MOŻE być dołączany do tytułów artykułu'
  );

  const accepted = resolveCandidateArticles(candidates, [existingDomagala], pikSourceItems, {
    now: new Date('2026-10-25T12:00:00Z'),
  });
  assert.equal(
    accepted.length,
    3,
    'Wszystkie 3 nowe wydarzenia z PIK Katowice muszą zostać zaakceptowane (brak fałszywej kolizji na "PIK Katowice – szczegóły")'
  );

  // Sprawdzenie, że matchesDeletedArticle również nie fałszuje dopasowania po syntetycznym tytule
  const deletedFromPik = [
    {
      title: 'Odwołany mały koncert w kawiarni',
      sourceUrl: 'https://pik.katowice.pl/odwolany-maly-koncert/',
      status: 'deleted',
    },
  ];
  pikSourceItems.push({
    title: 'PIK Katowice (Główne) – szczegóły',
    link: 'https://pik.katowice.pl/odwolany-maly-koncert/',
    sourceId: '1',
    sourceName: 'PIK Katowice (Główne)',
    sourceType: 'WEB',
    isDiscoveredLinkOnly: true,
  });
  assert.equal(
    matchesDeletedArticle(candidates[0], pikSourceItems, deletedFromPik),
    false,
    'matchesDeletedArticle nie może blokować innych wydarzeń z tego samego portalu przez syntetyczny tytuł'
  );
}
console.log('✅ Odblokowano artykuły z portali WWW (PIK Katowice, NOSPR itd.) — zero fałszywych kolizji na syntetycznych tytułach.');

// ---------------------------------------------------------------------------
// 3. Normalizacja sourceUrl (zachowanie ?id=..., usunięcie utm_* / &#038;) i ogólne URL-e źródeł
// ---------------------------------------------------------------------------
console.log('\n--- 3. Normalizacja sourceUrl (?id=... vs utm_*) oraz ogólne adresy repertuarów ---');

{
  // Zachowanie ?id=161518 vs ?id=199999 w Kinoteatrze Rialto
  const rialto1 = normalizeSourceUrl('https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=161518');
  const rialto2 = normalizeSourceUrl('https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=199999');
  assert.notEqual(
    rialto1,
    rialto2,
    'Różne identyfikatory wydarzeń ?id= w query stringu NIE MOGĄ być sklejane do tego samego URL'
  );
  assert.equal(
    normalizeSourceUrl('https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=161518&utm_source=rss'),
    rialto1,
    'Parametry trackingowe utm_* muszą być usuwane przy zachowaniu ?id=161518'
  );

  // Obsługa encji &#038; w linkach RSS (np. Silesion.PL)
  assert.equal(
    normalizeSourceUrl('https://silesion.pl/targi-ksiazki-w-katowicach-2026-program/?utm_source=rss&#038;utm_medium=rss&#038;utm_campaign=targi'),
    'https://silesion.pl/targi-ksiazki-w-katowicach-2026-program',
    'Parametry utm_* sklejone encją &#038; muszą zostać czysto usunięte'
  );

  // Ogólne adresy źródeł (repertuary, strony główne z config/sources.md)
  const genericSet = buildGenericSourceUrls();
  assert.equal(isGenericSourceUrl('https://kinoteatrrialto.bilety24.pl/repertuar/', genericSet), true);
  assert.equal(isGenericSourceUrl('https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/', genericSet), true);
  assert.equal(isGenericSourceUrl('https://ateneumteatr.pl/', genericSet), true);
  assert.equal(isGenericSourceUrl('https://parkslaski.pl', genericSet), true);
  assert.equal(isGenericSourceUrl('https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=161518', genericSet), false);
  assert.equal(isGenericSourceUrl('https://www.spodekkatowice.pl/pl/wydarzenia/k-pop-fever,4059.html', genericSet), false);

  // Dwa różne warsztaty ze wspólnego ogólnego URL-a Muzeum Śląskiego: drugi przechodzi!
  const existingWorkshop = {
    title: 'Muzeum Śląskie zaprasza na rodzinne warsztaty „Galeria dziwnych stworów”',
    sourceUrl: 'https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/',
    publishedDate: '2026-10-17',
    eventDate: '2026-10-25',
    status: 'published',
    archived: false,
  };
  const newLecture = {
    title: 'Wykład o architekturze modernistycznej Katowic w Muzeum Śląskim',
    sourceUrl: 'https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/',
    publishedDate: '2026-10-25',
    eventDate: '2026-11-08',
    status: 'published',
  };
  const sameWorkshopAgain = {
    title: 'Rodzinne warsztaty „Galeria dziwnych stworów” w Muzeum Śląskim',
    sourceUrl: 'https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/',
    publishedDate: '2026-10-25',
    eventDate: '2026-10-25',
    status: 'published',
  };

  assert.equal(
    isDuplicateArticle(newLecture, existingWorkshop, []),
    '',
    'Inne wydarzenie ze wspólnego ogólnego URL repertuaru NIE MOŻE być blokowane'
  );
  assert.equal(
    isDuplicateArticle(sameWorkshopAgain, existingWorkshop, []),
    'bardzo podobny tytuł',
    'To samo wydarzenie ze wspólnego ogólnego URL repertuaru MUSI być zablokowane po podobieństwie tytułu'
  );
}
console.log('✅ Normalizacja URL (?id=... zachowane, utm_* wycięte) i obsługa ogólnych adresów repertuarów działają bezbłędnie.');

// ---------------------------------------------------------------------------
// 4. Decyzja #1: Automatyczne zastępowanie nieopublikowanego draft przez pełny wpis published
// ---------------------------------------------------------------------------
console.log('\n--- 4. Decyzja #1: Zastępowanie nieopublikowanego szkicu (draft) przez wpis published ---');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kato-dedup-draft-test-'));
try {
  // Zapisujemy istniejący szkic (draft) sprzed 4 dni
  const draftFile = '2026-10-21-koncert-jazzowy-w-rialto-szkic.md';
  const draftPath = path.join(tempDir, draftFile);
  fs.writeFileSync(
    draftPath,
    [
      '---',
      'title: "Koncert jazzowy kwartetu północnego w Kinoteatrze Rialto"',
      'publishedDate: 2026-10-21',
      'eventDate: 2026-11-20',
      'city: "katowice"',
      'category: "kultura"',
      'status: "draft"',
      'summary: "Wstępna zapowiedź koncertu."',
      'isAlert: false',
      'sourceUrl: "https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=555111"',
      'aiGenerated: true',
      'archived: false',
      '---',
      '',
      'Szkic roboczy.',
      '',
    ].join('\n'),
    'utf8'
  );

  const loadedBefore = loadNewsRecords(tempDir);
  assert.equal(loadedBefore.length, 1);
  assert.equal(loadedBefore[0].status, 'draft');

  // Szkic nie może trafiać do coveredTopics blokujących Gemini
  const covered = buildCoveredTopics(loadedBefore, { now: new Date('2026-10-25T12:00:00Z') });
  assert.equal(covered.length, 0, 'Nieopublikowany draft nie może blokować tematu w coveredTopics');

  // 4A. Kolejny draft na ten sam temat MUSI zostać odrzucony (brak mnożenia szkiców)
  const anotherDraft = {
    title: 'Koncert jazzowy kwartetu północnego w Kinoteatrze Rialto',
    city: 'katowice',
    category: 'kultura',
    status: 'draft',
    publishedDate: '2026-10-25',
    eventDate: '2026-11-20',
    summary: 'Nadal niepełne dane.',
    location: 'Kinoteatr Rialto',
    isAlert: false,
    sourceUrl: 'https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=555111',
    content: 'Nadal szkic.',
  };
  const rejectedDraftResult = resolveCandidateArticles([anotherDraft], loadedBefore, [], {
    now: new Date('2026-10-25T12:00:00Z'),
  });
  assert.equal(rejectedDraftResult.length, 0, 'Kolejny draft dla istniejącego draftu musi zostać pominięty');
  assert.equal(fs.existsSync(draftPath), true, 'Oryginalny plik draftu musi pozostać na dysku');

  // 4B. Pełny wpis published na ten sam temat zastępuje wcześniejszy draft i usuwa stary plik szkicu!
  const fullPublished = {
    title: 'Koncert jazzowy kwartetu północnego w Kinoteatrze Rialto',
    city: 'katowice',
    category: 'kultura',
    status: 'published',
    publishedDate: '2026-10-25',
    eventDate: '2026-11-20',
    summary: 'Potwierdzony termin i ceny biletów na koncert kwartetu północnego.',
    location: 'Kinoteatr Rialto',
    isAlert: false,
    sourceUrl: 'https://kinoteatrrialto.bilety24.pl/wydarzenie/?id=555111',
    content: 'Pełny artykuł z potwierdzonymi szczegółami koncertu.',
  };

  const acceptedUpgrade = resolveCandidateArticles([fullPublished], loadedBefore, [], {
    now: new Date('2026-10-25T12:00:00Z'),
  });
  assert.equal(acceptedUpgrade.length, 1, 'Pełny artykuł published musi zostać zaakceptowany w miejsce draftu');

  const saved = writeArticle(acceptedUpgrade[0], '2026-10-25', { newsDir: tempDir });
  assert.equal(saved, true, 'writeArticle musi zapisać pełny artykuł');
  assert.equal(fs.existsSync(draftPath), false, 'Stary plik nieopublikowanego szkicu musi zostać automatycznie usunięty');

  const loadedAfter = loadNewsRecords(tempDir);
  assert.equal(loadedAfter.length, 1, 'W katalogu powinien pozostać dokładnie 1 docelowy artykuł');
  assert.equal(loadedAfter[0].status, 'published', 'Zapisany artykuł musi mieć status published');

  // 4C. Gdy w bazie istnieje JUŻ opublikowany artykuł ORAZ osierocony draft — kolejny published jest blokowany!
  const orphanDraft = {
    ...loadedBefore[0],
    file: '2026-10-22-orphan-draft.md',
    filePath: path.join(tempDir, '2026-10-22-orphan-draft.md'),
  };
  const blockedWhenPublishedExists = resolveCandidateArticles(
    [{ ...fullPublished }],
    [...loadedAfter, orphanDraft],
    [],
    { now: new Date('2026-10-26T12:00:00Z') }
  );
  assert.equal(
    blockedWhenPublishedExists.length,
    0,
    'Gdy istnieje już opublikowany odpowiednik, nowy artykuł MUSI zostać zablokowany nawet przy obecności starego draftu'
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
console.log('✅ Automatyczne zastępowanie nieopublikowanego szkicu (draft) przez pełny wpis published zweryfikowane.');

// ---------------------------------------------------------------------------
// 5. Decyzja #2: Tematy cykliczne w Archiwum vs ochrona przed duplikatami na produkcji
// ---------------------------------------------------------------------------
console.log('\n--- 5. Decyzja #2: Tematy cykliczne w Archiwum (archived: true) vs ochrona produkcji ---');

{
  // 5A. TWARDA BLOKADA: Koncert ze Spodka zarchiwizowany po >10 dniach z tym samym URL-em (nawet po 60 dniach!)
  const archivedSpodekConcert = {
    title: 'Gala Muzyki Filmowej z orkiestrą i chórem w Katowicach',
    sourceUrl: 'https://www.spodekkatowice.pl/pl/wydarzenia/gala-muzyki-filmowej-chor-orkiestra-symfoniczna,4140.html',
    publishedDate: '2026-10-11',
    eventDate: '2027-02-14',
    status: 'published',
    archived: true,
  };
  const sameSpodekAgain = {
    title: 'Wielka Gala Muzyki Filmowej w katowickim Spodku',
    sourceUrl: 'https://spodekkatowice.pl/pl/wydarzenia/gala-muzyki-filmowej-chor-orkiestra-symfoniczna,4140.html?utm_source=test',
    publishedDate: '2026-12-20',
    eventDate: '2027-02-14',
    status: 'published',
  };
  assert.equal(
    isDuplicateArticle(sameSpodekAgain, archivedSpodekConcert, [], { now: new Date('2026-12-20T12:00:00Z') }),
    'ten sam adres źródła',
    'Ten sam konkretny URL wydarzenia zarchiwizowanego MUSI być blokowany bezterminowo'
  );

  // 5B. TWARDA BLOKADA: Ten sam przyszły koncert z INNEGO portalu (inny URL, ta sama eventDate!)
  const sameConcertDifferentPortal = {
    title: 'Gala Muzyki Filmowej z orkiestrą i chórem w Katowicach',
    sourceUrl: 'https://pik.katowice.pl/gala-muzyki-filmowej-spodek/',
    publishedDate: '2026-12-20',
    eventDate: '2027-02-14',
    status: 'published',
  };
  assert.equal(
    isDuplicateArticle(sameConcertDifferentPortal, archivedSpodekConcert, [], { now: new Date('2026-12-20T12:00:00Z') }),
    'bardzo podobny tytuł',
    'Ten sam przyszły koncert z innego portalu (to samo eventDate) MUSI pozostać zablokowany nawet po archiwizacji pierwszego wpisu'
  );

  // 5C. TWARDA BLOKADA: Świeżo ręcznie zarchiwizowany artykuł (np. przyciskiem "A" 3 dni temu, brak eventDate)
  const manuallyArchivedRecent = {
    title: 'Przerwy w dostawie prądu w Tychach – sprawdź harmonogram',
    sourceUrl: 'https://mojetychy.pl/artykuly/artykul/przerwy-pazdziernik-tydzien-3',
    publishedDate: '2026-10-22',
    eventDate: null,
    status: 'published',
    archived: true,
  };
  const repostTwoDaysLater = {
    title: 'Przerwy w dostawie prądu w Tychach – sprawdź aktualny harmonogram',
    sourceUrl: 'https://tychy.info/przerwy-w-dostawie-pradu-pazdziernik',
    publishedDate: '2026-10-25',
    eventDate: null,
    status: 'published',
  };
  assert.equal(
    isDuplicateArticle(repostTwoDaysLater, manuallyArchivedRecent, [], { now: new Date('2026-10-25T12:00:00Z') }),
    'bardzo podobny tytuł',
    'Świeżo zarchiwizowany komunikat bez eventDate (< 35 dni) MUSI nadal blokować duplikaty międzyportalowe'
  );

  // 5D. ZEZWOLENIE: Nowa edycja wydarzenia cyklicznego w nowym terminie (inny URL + inne eventDate > 7 dni, stary wpis w Archiwum)
  const archivedOctoberLights = {
    title: 'Darmowe sprawdzanie świateł pojazdów w Katowicach',
    sourceUrl: 'https://mojekatowice.pl/artykuly/artykul/darmowe-sprawdzanie-swiatel-pazdziernik',
    publishedDate: '2026-10-22',
    eventDate: '2026-10-24',
    status: 'published',
    archived: true,
  };
  const novemberLightsEdition = {
    title: 'Darmowe sprawdzanie świateł pojazdów w Katowicach',
    sourceUrl: 'https://mojekatowice.pl/artykuly/artykul/darmowe-sprawdzanie-swiatel-listopad-termin',
    publishedDate: '2026-11-19',
    eventDate: '2026-11-21',
    status: 'published',
  };
  assert.equal(
    isDuplicateArticle(novemberLightsEdition, archivedOctoberLights, [], { now: new Date('2026-11-19T12:00:00Z') }),
    '',
    'Kolejna odsłona wydarzenia cyklicznego (inny URL i inne eventDate > 7 dni, poprzedni w Archiwum) MUSI zostać przepuszczona'
  );

  // 5E. ZEZWOLENIE: Cykliczny komunikat miejski bez eventDate (np. wyłączenia prądu / Mobilny PSZOK) po upływie >= 35 dni w Archiwum
  const decemberPowerOutage = {
    title: 'Przerwy w dostawie prądu w Tychach – sprawdź harmonogram',
    sourceUrl: 'https://mojetychy.pl/artykuly/artykul/przerwy-grudzien-nowy-harmonogram',
    publishedDate: '2026-11-30',
    eventDate: null,
    status: 'published',
  };
  const futureCheckDate = new Date(
    Date.parse('2026-10-22T00:00:00Z') + (CYCLIC_TOPIC_COOLDOWN_DAYS + 3) * 24 * 60 * 60 * 1000
  );
  assert.equal(
    isDuplicateArticle(decemberPowerOutage, manuallyArchivedRecent, [], { now: futureCheckDate }),
    '',
    `Po upływie ${CYCLIC_TOPIC_COOLDOWN_DAYS} dni zarchiwizowany komunikat miejski bez eventDate MUSI zezwalać na nową edycję pod nowym URL`
  );
}
console.log('✅ Tematy cykliczne w Archiwum przepuszczają nowe edycje przy 100% blokadzie duplikatów na produkcji.');

// ---------------------------------------------------------------------------
// 6. Decyzja #3: Pre-filtracja duplikatów URL i odblokowanie źródeł RSS w selectPromptItems
// ---------------------------------------------------------------------------
console.log('\n--- 6. Decyzja #3: Pre-filtracja duplikatów URL i balans RSS vs WEB w oknie 60 pozycji ---');

{
  const existingPublishedSpodek = Array.from({ length: 22 }, (_, idx) => ({
    title: `Opublikowany wcześniej koncert ${idx + 1}`,
    sourceUrl: `https://www.spodekkatowice.pl/pl/wydarzenia/stary-koncert-${idx + 1},10${idx}.html`,
    publishedDate: '2026-10-18',
    eventDate: '2027-01-15',
    status: 'published',
    archived: idx < 10,
  }));

  const simulatedSourceItems = [
    // 22 już opublikowane koncerty Spodka + 8 nowych koncertów Spodka
    ...existingPublishedSpodek.map((ex, idx) => ({
      title: ex.title,
      link: ex.sourceUrl,
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      sourceType: 'WEB',
      pubDate: undefined,
      eventDate: '2027-01-15',
      idx,
    })),
    ...Array.from({ length: 8 }, (_, idx) => ({
      title: `Nowy koncert w Spodku ${idx + 1}`,
      link: `https://www.spodekkatowice.pl/pl/wydarzenia/nowy-koncert-${idx + 1},90${idx}.html`,
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      sourceType: 'WEB',
      pubDate: undefined,
      eventDate: '2027-03-10',
    })),
    // 30 wydarzeń z MCK + 25 ze Stadionu Śląskiego + 10 z innych teatrów (łącznie >60 samych pozycji WEB!)
    ...Array.from({ length: 30 }, (_, idx) => ({
      title: `Wydarzenie MCK ${idx + 1}`,
      link: `https://www.mckkatowice.pl/pl/wydarzenia/mck-${idx + 1},80${idx}.html`,
      sourceId: '6',
      sourceName: 'MCK Katowice',
      sourceType: 'WEB',
      pubDate: undefined,
    })),
    ...Array.from({ length: 25 }, (_, idx) => ({
      title: `Wydarzenie Stadion Śląski ${idx + 1}`,
      link: `https://superautostadionslaski.pl/wiadomosci/stadion-${idx + 1}`,
      sourceId: '21',
      sourceName: 'Stadion Śląski',
      sourceType: 'WEB',
      pubDate: undefined,
    })),
    {
      title: 'Teatr Ateneum – Nadchodzące wydarzenia',
      link: 'https://ateneumteatr.pl/',
      sourceId: '15',
      sourceName: 'Teatr Ateneum',
      sourceType: 'WEB',
      isSyntheticContainer: true,
    },
    // 6 miejskich kanałów RSS po 10 świeżych artykułów (dawniej w 100% wypychanych poza .slice(0, 60)!)
    ...['22', '24', '25', '26', '27', '28'].flatMap((sourceId, sIdx) =>
      Array.from({ length: 10 }, (_, itemIdx) => ({
        title: `Wiadomość RSS ze źródła ${sourceId} nr ${itemIdx + 1}`,
        link: `https://portal-${sourceId}.pl/artykul/${itemIdx + 1}`,
        sourceId,
        sourceName: `Portal RSS ${sourceId}`,
        sourceType: 'RSS',
        pubDate: new Date(Date.parse('2026-10-25T12:00:00Z') - (itemIdx * 3600 + sIdx * 60) * 1000).toISOString(),
      }))
    ),
  ];

  const selected = selectPromptItems(simulatedSourceItems, existingPublishedSpodek, {
    maxItems: MAX_PROMPT_ITEMS,
  });

  assert.equal(selected.length, 60, 'Pula promptItems powinna wynosić dokładnie 60 pozycji');

  // Żaden z 22 już opublikowanych koncertów Spodka nie może zająć miejsca w prompcie
  const leakedOldSpodek = selected.filter((item) => item.link.includes('stary-koncert-'));
  assert.equal(
    leakedOldSpodek.length,
    0,
    'Żaden już opublikowany koncert nie może zajmować limitu 60 pozycji wysyłanych do Gemini'
  );

  // Równowaga 30 RSS + 30 WEB
  const rssSelected = selected.filter((item) => item.sourceType === 'RSS');
  const webSelected = selected.filter((item) => item.sourceType !== 'RSS');
  assert.equal(rssSelected.length, 30, 'Źródła RSS muszą otrzymać swoją połowę puli (30 świeżych pozycji)');
  assert.equal(webSelected.length, 30, 'Źródła WEB muszą otrzymać swoją połowę puli (30 świeżych pozycji)');

  // Wszystkie 6 kanałów RSS oraz późniejsze źródła WEB (15 Teatr Ateneum, 21 Stadion Śląski) muszą być reprezentowane!
  const rssSourceIds = new Set(rssSelected.map((i) => i.sourceId));
  assert.deepEqual(
    [...rssSourceIds].sort(),
    ['22', '24', '25', '26', '27', '28'],
    'Każdy aktywny miejski kanał RSS musi mieć reprezentację w prompcie'
  );
  assert.ok(
    webSelected.some((i) => i.sourceId === '15') && webSelected.some((i) => i.sourceId === '21'),
    'Dalsze źródła WEB (np. [15] Teatr Ateneum, [21] Stadion Śląski) nie mogą być zagłodzone przez [5] Spodek i [6] MCK'
  );
}
console.log('✅ Pre-filtracja duplikatów URL oraz balans 30 RSS + 30 WEB (round-robin) zweryfikowane.');

console.log('\n🎉 Wszystkie testy wykrywania duplikatów (test-duplicate-detection.mjs) zakończone sukcesem (100% PASS)!\n');
