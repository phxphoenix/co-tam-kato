import assert from 'node:assert/strict';
import {
  MAX_ARTICLES,
  MAX_PROMPT_ITEMS,
  getUpcomingWarsawMonths,
  parseNosprKalendarz,
  parseNosprAktualnosci,
  parseTeatrSlaski,
  isHighPriorityTicketSource,
  interleaveWebItems,
  selectPromptItems,
} from './daily-digest.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parserów i priorytetyzacji (NOSPR, Spodek, Teatr Śląski)');
console.log('======================================================\n');

// ---------------------------------------------------------------------------
// 1. Stała MAX_ARTICLES === 4 oraz obliczanie kolejnych miesięcy kalendarza
// ---------------------------------------------------------------------------
console.log('--- 1. Limit MAX_ARTICLES === 4 oraz horyzont 3 miesięcy (getUpcomingWarsawMonths) ---');

assert.equal(MAX_ARTICLES, 4, 'Stała MAX_ARTICLES musi wynosić 4');

const monthsAcrossYear = getUpcomingWarsawMonths(new Date('2026-11-01T12:00:00Z'), 3);
assert.deepEqual(
  monthsAcrossYear,
  ['2026-11', '2026-12', '2027-01'],
  'getUpcomingWarsawMonths musi poprawnie przechodzić przez granicę roku (listopad -> grudzień -> styczeń)'
);
console.log('✅ MAX_ARTICLES === 4 oraz wyliczanie 3 kolejnych miesięcy (z przejściem roku) działają poprawnie.');

// ---------------------------------------------------------------------------
// 2. Parser parseNosprKalendarz: filtr wyprzedanych, dat przeszłych i grupowanie
// ---------------------------------------------------------------------------
console.log('\n--- 2. Parser parseNosprKalendarz (NOSPR – Kalendarz) ---');

{
  const sampleNosprNovHtml = `
    <div class="grid-22 calendar__row" id="day-30">
      <div class="term">Piątek <time datetime="2026-10-30">30.10</time></div>
      <div class="tiles tiles--calendar">
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/miniony-koncert" class="tile__link"><span class="sr-only">Miniony koncert</span></a>
          <div class="tile__term tile__term--calendar"><span class="hour">19:30</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">Miniony koncert październikowy</h3>
            <p class="description">Sala koncertowa</p>
          </div>
          <a href="https://nospr.org.pl/sklep/produkt/miniony" class="extra extra--calendar">Kup bilet</a>
        </div>
      </div>
    </div>
    <div class="grid-22 calendar__row" id="day-05">
      <div class="term">Czwartek <time datetime="2026-11-05">05.11</time></div>
      <div class="tiles tiles--calendar">
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/spacer-dzwiekowy-1" class="tile__link"><span class="sr-only">Spacer dźwiękowy</span></a>
          <div class="tile__text tile__text--calendar"><div class="category">Edukacja</div></div>
          <div class="tile__term tile__term--calendar"><span class="hour">10:30</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">Spacer dźwiękowy</h3>
            <p class="description">NOSPR</p>
          </div>
        </div>
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/requiem-mozarta-wyprzedane" class="tile__link"><span class="sr-only">NOSPR / Requiem Mozarta</span></a>
          <div class="tile__term tile__term--calendar"><span class="hour">19:30</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">NOSPR / Requiem Mozarta</h3>
            <p class="description">Sala koncertowa</p>
          </div>
          <span class="extra extra--calendar">Brak biletów</span>
        </div>
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/urban-jazz-night" class="tile__link"><span class="sr-only">Urban Jazz Night</span></a>
          <div class="tile__text tile__text--calendar"><div class="category">JazzKLUB</div></div>
          <div class="tile__term tile__term--calendar"><span class="hour">18:00</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">Urban Jazz Night – Leszek Możdżer &amp; EABS</h3>
            <p class="description">Sala koncertowa</p>
          </div>
          <a href="https://nospr.org.pl/sklep/produkt/urban-jazz" class="extra extra--calendar extra--alert">Ostatnie bilety - Kup bilet</a>
        </div>
      </div>
    </div>
  `;

  const sampleNosprDecHtml = `
    <div class="grid-22 calendar__row" id="day-12">
      <div class="term">Sobota <time datetime="2026-12-12">12.12</time></div>
      <div class="tiles tiles--calendar">
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/spacer-dzwiekowy-2" class="tile__link"><span class="sr-only">Spacer dźwiękowy</span></a>
          <div class="tile__text tile__text--calendar"><div class="category">Edukacja</div></div>
          <div class="tile__term tile__term--calendar"><span class="hour">11:00</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">Spacer dźwiękowy</h3>
            <p class="description">NOSPR</p>
          </div>
        </div>
        <div class="tile tile--calendar single">
          <a href="/pl/kalendarz/koncert- grudniowy-symfoniczny" class="tile__link"><span class="sr-only">NOSPR / Koncert Symfoniczny Grudniowy</span></a>
          <div class="tile__text tile__text--calendar"><div class="category">Orkiestra symfoniczna</div></div>
          <div class="tile__term tile__term--calendar"><span class="hour">19:30</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">NOSPR / Koncert Symfoniczny Grudniowy</h3>
            <p class="description">Sala kameralna</p>
          </div>
          <a href="https://nospr.org.pl/sklep/produkt/grudzien" class="extra extra--calendar">Kup bilet</a>
        </div>
      </div>
    </div>
  `;

  const parsedNospr = parseNosprKalendarz(
    [sampleNosprNovHtml, sampleNosprDecHtml],
    'https://nospr.org.pl/pl/kalendarz',
    { now: new Date('2026-11-01T12:00:00Z') }
  );

  // Powinny zostać 3 pozycje: 2 biletowane koncerty na czele + 1 zgrupowany "Spacer dźwiękowy"
  assert.equal(parsedNospr.length, 3, 'Wyprzedany koncert (Brak biletów) oraz miniona data muszą zostać odrzucone, a powtórki Spaceru dźwiękowego zgrupowane');

  assert.equal(parsedNospr[0].title, 'Urban Jazz Night – Leszek Możdżer & EABS');
  assert.equal(parsedNospr[0].eventDate, '2026-11-05');
  assert.equal(parsedNospr[0].link, 'https://nospr.org.pl/pl/kalendarz/urban-jazz-night');
  assert.equal(parsedNospr[0].ticketStatus, 'Ostatnie bilety w sprzedaży');
  assert.ok(parsedNospr[0].description.includes('Sala koncertowa'), 'Opis musi zawierać nazwę sali');
  assert.ok(parsedNospr[0].description.includes('18:00'), 'Opis musi zawierać godzinę koncertu');

  assert.equal(parsedNospr[1].title, 'NOSPR / Koncert Symfoniczny Grudniowy');
  assert.equal(parsedNospr[1].eventDate, '2026-12-12');
  assert.equal(parsedNospr[1].ticketStatus, 'Bilety w sprzedaży');
  assert.ok(parsedNospr[1].description.includes('Sala kameralna'));

  // Zgrupowany "Spacer dźwiękowy" (bez przycisku Kup bilet) jest na końcu i ma dodatkowy termin w opisie
  assert.equal(parsedNospr[2].title, 'Spacer dźwiękowy');
  assert.equal(parsedNospr[2].eventDate, '2026-11-05');
  assert.ok(parsedNospr[2].description.includes('2026-12-12 (11:00)'), 'Zgrupowany cykl musi zawierać dodatkowe terminy w opisie');
}
console.log('✅ parseNosprKalendarz poprawnie wyciąga daty/sale/godziny, odrzuca "Brak biletów" i szereguje koncerty biletowane na początku.');

// ---------------------------------------------------------------------------
// 3. Parser parseNosprAktualnosci: konwersja DD.MM.YYYY i filtr MAX_AGE_DAYS
// ---------------------------------------------------------------------------
console.log('\n--- 3. Parser parseNosprAktualnosci (NOSPR – Aktualności) ---');

{
  const sampleAktualnosciHtml = `
    <div class="m-tiles">
      <div class="tiles indentation">
        <div class="grid-7 tile js-tile" data-scroll="slide">
          <a href="/pl/aktualnosci/start-sprzedazy-biletow-wiosna-2027" class="tile__link"><span class="sr-only">Start sprzedaży biletów na wiosnę 2027</span></a>
          <div data-hover="29.10.2026" class="tile__date"><time datetime="">29.10.2026</time></div>
          <h3 class="tile__title tile__title--info">Start sprzedaży biletów na wiosnę 2027</h3>
          <p class="tile__copy">Ruszyła otwarta sprzedaż biletów na koncerty specjalne.</p>
        </div>
        <div class="grid-7 tile js-tile" data-scroll="slide">
          <a href="/pl/aktualnosci/stary-komunikat-lipiec" class="tile__link"><span class="sr-only">Stary komunikat z lipca</span></a>
          <div data-hover="15.07.2026" class="tile__date"><time datetime="">15.07.2026</time></div>
          <h3 class="tile__title tile__title--info">Stary komunikat z lipca</h3>
          <p class="tile__copy"></p>
        </div>
      </div>
    </div>
  `;

  const parsedAkt = parseNosprAktualnosci(
    sampleAktualnosciHtml,
    'https://nospr.org.pl/pl/aktualnosci',
    { now: new Date('2026-11-01T12:00:00Z'), maxAgeDays: 14 }
  );

  assert.equal(parsedAkt.rawTileCount, 2, 'rawTileCount musi odnotować 2 kafelki w strukturze DOM');
  assert.equal(parsedAkt.length, 1, 'Wpis sprzed 3 miesięcy musi zostać odfiltrowany przez maxAgeDays');
  assert.equal(parsedAkt[0].title, 'Start sprzedaży biletów na wiosnę 2027');
  assert.equal(parsedAkt[0].pubDate, '2026-10-29');
  assert.equal(parsedAkt[0].eventDate, null);
  assert.equal(parsedAkt[0].isEvent, false);
  assert.equal(parsedAkt[0].link, 'https://nospr.org.pl/pl/aktualnosci/start-sprzedazy-biletow-wiosna-2027');
  assert.ok(parsedAkt[0].description.includes('Ruszyła otwarta sprzedaż biletów'));
}
console.log('✅ parseNosprAktualnosci poprawnie parsuje datę DD.MM.YYYY do pubDate i odrzuca przeterminowane ogłoszenia.');

// ---------------------------------------------------------------------------
// 4. Parser parseTeatrSlaski: pomijanie archiwalnych slajdów i grupowanie terminów
// ---------------------------------------------------------------------------
console.log('\n--- 4. Parser parseTeatrSlaski (Teatr Śląski – Repertuar) ---');

{
  const sampleTeatrHtml = `
    <div class="timetable swiper-container" data-date-act="202611">
      <ul class="swiper-wrapper">
        <li class="item swiper-slide" data-date-act="202607">
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">11.07</div></div>
            <div class="col col-12 col-md-10 col-events">
              <div class="event first last">
                <div class="data">
                  <div class="title text--32 data-title">Archiwalny Spektakl Lipcowy</div>
                  <div class="info">
                    <div class="basic">
                      <span class="hour text--18">19:00</span>
                      <span class="places"><span class="place">Duża Scena</span></span>
                    </div>
                    <div class="ticket"><a href="https://teatrslaski.art.pl/repertuar/archiwalny/"><span>Kup bilet</span></a></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li class="item swiper-slide" data-date-act="202611">
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">7.11</div></div>
            <div class="col col-12 col-md-10 col-events">
              <div class="event first last">
                <div class="data">
                  <div class="title text--32 data-title">Tragedyjo Hamleta, ksiyncia Dynymarku</div>
                  <div class="info">
                    <div class="basic">
                      <span class="hour text--18">20:00</span>
                      <span class="categories"><span class="category">Premiera</span></span>
                      <span class="places"><span class="place">Duża Scena</span></span>
                    </div>
                    <div class="ticket"><a href="https://teatrslaski.art.pl/repertuar/hamlet/"><span>Kup bilet</span></a></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li class="item swiper-slide" data-date-act="202612">
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">12.12</div></div>
            <div class="col col-12 col-md-10 col-events">
              <div class="event first last">
                <div class="data">
                  <div class="title text--32 data-title">Tragedyjo Hamleta, ksiyncia Dynymarku</div>
                  <div class="info">
                    <div class="basic">
                      <span class="hour text--18">19:00</span>
                      <span class="places"><span class="place">Duża Scena</span></span>
                    </div>
                    <div class="ticket"><a href="https://teatrslaski.art.pl/repertuar/hamlet/"><span>Kup bilet</span></a></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  `;

  const parsedTeatr = parseTeatrSlaski(
    sampleTeatrHtml,
    'https://teatrslaski.art.pl/repertuar/',
    { now: new Date('2026-11-01T12:00:00Z') }
  );

  assert.equal(parsedTeatr.length, 1, 'Archiwalny slajd 202607 musi zostać pominięty, a 2 pokazy Hamleta zgrupowane w 1 wpis');
  assert.equal(parsedTeatr[0].title, 'Tragedyjo Hamleta, ksiyncia Dynymarku');
  assert.equal(parsedTeatr[0].eventDate, '2026-11-07');
  assert.equal(parsedTeatr[0].link, 'https://teatrslaski.art.pl/repertuar/hamlet/');
  assert.ok(parsedTeatr[0].description.includes('Pozostałe terminy: 2026-12-12 (19:00)'), 'Opis musi zawierać kolejne terminy spektaklu');
  assert.ok(parsedTeatr[0].description.includes('Duża Scena'), 'Opis musi zawierać nazwę sceny');
}
console.log('✅ parseTeatrSlaski pomija archiwalne slajdy (data-date-act < YYYYMM) i grupuje wielokrotne pokazy spektaklu.');

// ---------------------------------------------------------------------------
// 5. Priorytetyzacja w selectPromptItems i interleaveWebItems
// ---------------------------------------------------------------------------
console.log('\n--- 5. Priorytetyzacja NOSPR, Spodka i Teatru Śląskiego w selectPromptItems ---');

{
  assert.equal(isHighPriorityTicketSource({ sourceId: '7', sourceName: 'NOSPR (Kalendarz)' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '30', sourceName: 'NOSPR – Aktualności' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '5', sourceName: 'Spodek Katowice' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '10', sourceName: 'Teatr Śląski' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '6', sourceName: 'MCK Katowice' }), false);

  // Już opublikowany koncert z NOSPR na najbliższy tydzień -> powinien zostać odfiltrowany,
  // odsłaniając koncerty z dalszych miesięcy!
  const existingArticles = [
    {
      title: 'Już opisany koncert w NOSPR z pierwszego tygodnia',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/juz-opisany-koncert',
      publishedDate: '2026-10-28',
      eventDate: '2026-11-05',
      status: 'published',
      archived: false,
    },
  ];

  const candidatePool = [
    // Standardowe źródła WEB (duża liczba pozycji)
    ...Array.from({ length: 20 }, (_, i) => ({
      title: `Targi w MCK nr ${i + 1}`,
      link: `https://www.mckkatowice.pl/pl/wydarzenia/targi-${i + 1},${100 + i}.html`,
      sourceId: '6',
      sourceName: 'MCK Katowice',
      sourceType: 'WEB',
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      title: `Wydarzenie na Stadionie Śląskim nr ${i + 1}`,
      link: `https://superautostadionslaski.pl/wiadomosci/bieg-${i + 1}`,
      sourceId: '21',
      sourceName: 'Stadion Śląski',
      sourceType: 'WEB',
    })),
    {
      title: 'Teatr Ateneum – Nadchodzące wydarzenia',
      link: 'https://ateneumteatr.pl/',
      sourceId: '15',
      sourceName: 'Teatr Ateneum',
      sourceType: 'WEB',
      isSyntheticContainer: true,
    },
    // Źródła priorytetowe: NOSPR (Kalendarz), NOSPR (Aktualności), Spodek, Teatr Śląski
    {
      title: 'Już opisany koncert w NOSPR z pierwszego tygodnia',
      link: 'https://nospr.org.pl/pl/kalendarz/juz-opisany-koncert',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-11-05',
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `Przyszły koncert w NOSPR za 2 miesiące nr ${i + 1}`,
      link: `https://nospr.org.pl/pl/kalendarz/przyszly-koncert-${i + 1}`,
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: `2027-01-1${i}`,
    })),
    {
      title: 'NOSPR ogłasza sprzedaż biletów na nowy cykl koncertowy',
      link: 'https://nospr.org.pl/pl/aktualnosci/nowy-cykl-biletowy',
      sourceId: '30',
      sourceName: 'NOSPR – Aktualności',
      sourceType: 'WEB',
      pubDate: '2026-10-30',
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      title: `Wielkie widowisko w Spodku nr ${i + 1}`,
      link: `https://www.spodekkatowice.pl/pl/wydarzenia/widowisko-${i + 1},${200 + i}.html`,
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      sourceType: 'WEB',
      eventDate: `2027-02-1${i}`,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      title: `Premiera w Teatrze Śląskim nr ${i + 1}`,
      link: `https://teatrslaski.art.pl/repertuar/premiera-${i + 1}/`,
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      sourceType: 'WEB',
      eventDate: `2026-12-1${i}`,
    })),
    // Źródła RSS (35 artykułów)
    ...Array.from({ length: 35 }, (_, i) => ({
      title: `Wiadomość miejska RSS nr ${i + 1}`,
      link: `https://mojekatowice.pl/artykul-${i + 1}`,
      sourceId: '22',
      sourceName: 'mojeKatowice.pl',
      sourceType: 'RSS',
      pubDate: new Date(Date.parse('2026-11-01T10:00:00Z') - i * 3600 * 1000).toISOString(),
    })),
  ];

  const selected = selectPromptItems(candidatePool, existingArticles, { maxItems: MAX_PROMPT_ITEMS });
  assert.equal(selected.length, 60, 'Łączna pula promptItems musi wynosić 60 pozycji');

  const rssInSelected = selected.filter((i) => i.sourceType === 'RSS');
  const webInSelected = selected.filter((i) => i.sourceType !== 'RSS');
  assert.equal(rssInSelected.length, 30, 'Połowa puli (30 pozycji) musi należeć do źródeł RSS');
  assert.equal(webInSelected.length, 30, 'Połowa puli (30 pozycji) musi należeć do źródeł WEB');

  // Już opisany koncert w NOSPR z pierwszego tygodnia nie może trafić do promptu
  assert.equal(
    webInSelected.some((i) => i.link.includes('juz-opisany-koncert')),
    false,
    'Już opublikowany koncert w NOSPR musi zostać odfiltrowany po URL, robiąc miejsce koncertom z dalszych miesięcy'
  );

  // Pierwsze 4 pozycje w puli WEB to dokładnie: [7] NOSPR (Kalendarz), [30] NOSPR – Aktualności, [5] Spodek, [10] Teatr Śląski
  assert.deepEqual(
    webInSelected.slice(0, 4).map((i) => i.sourceId),
    ['7', '30', '5', '10'],
    'Na czele puli WEB muszą znaleźć się kolejno: NOSPR (Kalendarz), NOSPR – Aktualności, Spodek Katowice i Teatr Śląski'
  );
  assert.ok(
    webInSelected.slice(0, 4).every((i) => i.highPriority === true),
    'Pozycje priorytetowe muszą posiadać flagę highPriority: true'
  );

  // Jednocześnie pozostałe źródła WEB (6 MCK, 15 Teatr Ateneum, 21 Stadion Śląski) są obecne w puli 30 WEB
  for (const requiredId of ['6', '15', '21']) {
    assert.ok(
      webInSelected.some((i) => i.sourceId === requiredId),
      `Standardowe źródło WEB [${requiredId}] musi zachować reprezentację w puli WEB`
    );
  }
}
console.log('✅ Priorytetyzacja w selectPromptItems (NOSPR -> Spodek -> Teatr Śląski) oraz ochrona pozostałych źródeł działają bezbłędnie.');

console.log('\n🎉 Wszystkie testy w test-priority-venues.mjs zakończone pełnym sukcesem (100% PASS)!\n');
