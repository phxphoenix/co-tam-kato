import assert from 'node:assert/strict';
import {
  MAX_ARTICLES,
  MAX_PROMPT_ITEMS,
  getUpcomingWarsawMonths,
  parseNosprKalendarz,
  parseNosprAktualnosci,
  parseTeatrSlaski,
  parseTeatrRozrywki,
  isHighPriorityTicketSource,
  interleaveWebItems,
  selectPromptItems,
  validateArticle,
} from './daily-digest.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parserów, priorytetyzacji i kategorii (NOSPR, Spodek, Teatr Śląski, Teatr Rozrywki)');
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
          <a href="/pl/kalendarz/sylwester-z-nospr" class="tile__link"><span class="sr-only">Gala Sylwestrowa w NOSPR</span></a>
          <div class="tile__term tile__term--calendar"><span class="hour">20:00</span></div>
          <div class="tile__text tile__text--calendar">
            <h3 class="tile__title tile__title--calendar">Wielka Gala Sylwestrowa w NOSPR</h3>
            <p class="description">Sala koncertowa</p>
          </div>
          <a href="https://nospr.org.pl/sklep/produkt/sylwester" class="extra extra--calendar">Kup bilet</a>
        </div>
      </div>
    </div>
  `;

  const parsedNospr = parseNosprKalendarz(
    [sampleNosprNovHtml, sampleNosprDecHtml],
    'https://nospr.org.pl/pl/kalendarz',
    { now: new Date('2026-11-01T12:00:00Z') }
  );

  // 1. Miniony koncert z 30.10 musi zostać odrzucony
  assert.equal(
    parsedNospr.some((i) => i.eventDate === '2026-10-30'),
    false,
    'Minione wydarzenie z 30.10 musi zostać odrzucone'
  );

  // 2. Requiem Mozarta ("Brak biletów") musi zostać twardo odrzucone
  assert.equal(
    parsedNospr.some((i) => i.title.includes('Requiem Mozarta')),
    false,
    'Wydarzenie z etykietą "Brak biletów" musi zostać twardo odrzucone'
  );

  // 3. Sprawdzamy wyciągnięte wydarzenia
  const urbanJazz = parsedNospr.find((i) => i.title.includes('Urban Jazz Night'));
  assert.ok(urbanJazz, 'Urban Jazz Night musi być obecne');
  assert.equal(urbanJazz.eventDate, '2026-11-05');
  assert.equal(urbanJazz.link, 'https://nospr.org.pl/pl/kalendarz/urban-jazz-night');
  assert.ok(urbanJazz.description.includes('Sala koncertowa'), 'Opis musi zawierać nazwę sali');
  assert.ok(urbanJazz.description.includes('Ostatnie bilety w sprzedaży'), 'Opis musi zawierać status ostatnich biletów');

  const sylwester = parsedNospr.find((i) => i.title.includes('Gala Sylwestrowa'));
  assert.ok(sylwester, 'Gala Sylwestrowa z grudnia musi zostać wyciągnięta z drugiego miesiąca');
  assert.equal(sylwester.eventDate, '2026-12-12');
  assert.ok(sylwester.description.includes('Bilety w sprzedaży'), 'Opis musi zawierać status dostępności biletów');

  // 4. Koncerty biletowane trafiają na początek listy
  assert.ok(
    parsedNospr[0].description.includes('bilety') || parsedNospr[0].description.includes('Bilety'),
    'Pozycje z biletami w sprzedaży powinny znaleźć się przed pozycjami ogólnymi'
  );
}
console.log('✅ parseNosprKalendarz poprawnie wyciąga daty/sale/godziny, odrzuca "Brak biletów" i szereguje koncerty biletowane na początku.');

// ---------------------------------------------------------------------------
// 3. Parser parseNosprAktualnosci: konwersja DD.MM.YYYY i filtr MAX_AGE_DAYS
// ---------------------------------------------------------------------------
console.log('\n--- 3. Parser parseNosprAktualnosci (NOSPR – Aktualności) ---');

{
  const sampleAktualnosciHtml = `
    <div class="tiles tiles--news">
      <div class="tile js-tile single">
        <a href="/pl/aktualnosci/nowy-sezon-sprzedaz-biletow" class="tile__link"><span class="sr-only">Start sprzedaży biletów na nowy sezon</span></a>
        <div class="tile__date"><time datetime="28.10.2026">28.10.2026</time></div>
        <div class="tile__text"><h3 class="tile__title">Start sprzedaży biletów na sezon 2026/2027</h3></div>
        <div class="tile__copy">Od najbliższego poniedziałku ruszają kasy biletowe i sprzedaż online na wszystkie koncerty.</div>
      </div>
      <div class="tile js-tile single">
        <a href="/pl/aktualnosci/stary-komunikat-sprzed-pol-roku" class="tile__link"><span class="sr-only">Stary komunikat</span></a>
        <div class="tile__date"><time datetime="15.01.2026">15.01.2026</time></div>
        <div class="tile__text"><h3 class="tile__title">Stary komunikat z początku roku</h3></div>
      </div>
    </div>
  `;

  const parsedAkt = parseNosprAktualnosci(
    sampleAktualnosciHtml,
    'https://nospr.org.pl/pl/aktualnosci',
    { now: new Date('2026-11-01T12:00:00Z') }
  );

  assert.equal(parsedAkt.length, 1, 'Tylko świeży komunikat powinien zostać zachowany (stary >14 dni odrzucony)');
  assert.equal(parsedAkt[0].title, 'Start sprzedaży biletów na sezon 2026/2027');
  assert.equal(parsedAkt[0].pubDate, '2026-10-28', 'Data DD.MM.YYYY musi zostać przekształcona w ISO YYYY-MM-DD');
  assert.equal(parsedAkt[0].eventDate, null, 'W aktualnościach eventDate powinno wynosić null (jest to data publikacji)');
  assert.equal(parsedAkt[0].isEvent, false);
}
console.log('✅ parseNosprAktualnosci poprawnie parsuje datę DD.MM.YYYY do pubDate i odrzuca przeterminowane ogłoszenia.');

// ---------------------------------------------------------------------------
// 4. Parser parseTeatrSlaski: repertuar z pomijaniem archiwalnych slajdów i grupowaniem
// ---------------------------------------------------------------------------
console.log('\n--- 4. Parser parseTeatrSlaski (Teatr Śląski) ---');

{
  const sampleTeatrHtml = `
    <div class="repertoire-slider">
      <ul class="swiper-wrapper">
        <li class="item swiper-slide" data-date-act="202607">
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">15.07</div></div>
            <div class="col col-12 col-md-10 col-events">
              <div class="event first last">
                <div class="data">
                  <div class="title text--32 data-title">Letni spektakl archiwalny</div>
                  <div class="info">
                    <div class="basic"><span class="hour text--18">19:00</span></div>
                    <div class="ticket"><a href="https://teatrslaski.art.pl/repertuar/archiwalny/"><span>Kup bilet</span></a></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
        <li class="item swiper-slide" data-date-act="202611">
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">07.11</div></div>
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
          <div class="day row">
            <div class="col col-12 col-md-2 col-info"><div class="text--32">08.11</div></div>
            <div class="col col-12 col-md-10 col-events">
              <div class="event first last">
                <div class="data">
                  <div class="title text--32 data-title">Wyprzedany spektakl</div>
                  <div class="info">
                    <div class="basic"><span class="hour text--18">18:00</span></div>
                    <div class="ticket"><span class="sold-out">Brak biletów</span></div>
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
// 5. Parser parseTeatrRozrywki: odrzucanie "Brak miejsc", przeszłych dat i grupowanie
// ---------------------------------------------------------------------------
console.log('\n--- 5. Parser parseTeatrRozrywki (Teatr Rozrywki Chorzów) ---');

{
  const sampleTeatrRozrywkiHtml = `
    <article class="spectacle-excerpt row">
      <div class="header col-md-5">
        <div>
          <h2><a href="/repertuar/918.html?view=event">KTO W PŁOMIENIACH (MINIONY)</a></h2>
          <p style="text-align: left;">Teatr Rozrywki - Mała Scena</p>
        </div>
      </div>
      <div class="col-md-7">
        <div class="content col-xs-8">
          <p><span>30.10.2026</span><span>19:30</span></p>
        </div>
        <div class="col-xs-4">
          <p class="more green"><a class="green" href="/system.html?id=5100">Kup bilet ></a></p>
        </div>
      </div>
    </article>
    <article class="spectacle-excerpt row">
      <div class="header col-md-5">
        <div>
          <h2><a href="/repertuar/919.html?view=event">SPEKTAKL WYPRZEDANY</a></h2>
          <p style="text-align: left;">Teatr Rozrywki - Duża Scena</p>
        </div>
      </div>
      <div class="col-md-7">
        <div class="content col-xs-8">
          <p><span>04.11.2026</span><span>19:00</span></p>
        </div>
        <div class="col-xs-4">
          <p class="more red"><a class="red" href="/system.html?id=5158">Brak miejsc ></a></p>
        </div>
      </div>
    </article>
    <article class="spectacle-excerpt row">
      <div class="header col-md-5">
        <div>
          <h2><a href="/repertuar/734.html?view=event">Pan Tadeusz Muzycznie</a></h2>
          <p style="text-align: left;">Teatr Rozrywki - Duża Scena</p>
        </div>
      </div>
      <div class="col-md-7">
        <div class="content col-xs-8">
          <p><span>05.11.2026</span><span>09:00</span></p>
        </div>
        <div class="col-xs-4">
          <p class="more orange"><a class="orange" href="/system.html?id=5148">Ostatnie wolne miejsca ></a></p>
        </div>
      </div>
    </article>
    <article class="spectacle-excerpt row">
      <div class="header col-md-5">
        <div>
          <h2><a href="/repertuar/734.html?view=event">Pan Tadeusz Muzycznie</a></h2>
          <p style="text-align: left;">Teatr Rozrywki - Duża Scena</p>
        </div>
      </div>
      <div class="col-md-7">
        <div class="content col-xs-8">
          <p><span>05.11.2026</span><span>11:30</span></p>
        </div>
        <div class="col-xs-4">
          <p class="more green"><a class="green" href="/system.html?id=5149">Kup bilet ></a></p>
        </div>
      </div>
    </article>
    <article class="spectacle-excerpt row">
      <div class="header col-md-5">
        <div>
          <h2><a href="/repertuar/921.html?view=event">Aga Zaryan - Second Time Around Tour</a></h2>
          <p style="text-align: left;">Teatr Rozrywki - Duża Scena</p>
        </div>
      </div>
      <div class="col-md-7">
        <div class="content col-xs-8">
          <p><span>06.11.2026</span><span>19:00</span></p>
        </div>
        <div class="col-xs-4">
          <p class="more green"><a class="green" href="/system.html?id=5138">Kup bilet ></a></p>
        </div>
      </div>
    </article>
  `;

  const parsedTR = parseTeatrRozrywki(
    sampleTeatrRozrywkiHtml,
    'https://teatr-rozrywki.pl/repertuar.html',
    { now: new Date('2026-11-01T12:00:00Z') }
  );

  // 1. Miniony spektakl z 30.10 musi zostać odrzucony
  assert.equal(
    parsedTR.some((i) => i.eventDate === '2026-10-30'),
    false,
    'Miniony spektakl z 30.10 musi zostać pominięty'
  );

  // 2. Wyprzedany spektakl z "Brak miejsc >" musi zostać pominięty
  assert.equal(
    parsedTR.some((i) => i.title.includes('WYPRZEDANY')),
    false,
    'Spektakl z "Brak miejsc >" musi zostać pominięty'
  );

  // 3. Powtórka spektaklu "Pan Tadeusz Muzycznie" (godz. 09:00 i 11:30) musi zostać zgrupowana w 1 wpis
  assert.equal(parsedTR.length, 2, 'Powinny pozostać dokładnie 2 unikalne spektakle (Pan Tadeusz oraz Aga Zaryan)');
  const panTadeusz = parsedTR.find((i) => i.title === 'Pan Tadeusz Muzycznie');
  assert.ok(panTadeusz, 'Pan Tadeusz Muzycznie musi być obecny');
  assert.equal(panTadeusz.eventDate, '2026-11-05');
  assert.equal(panTadeusz.defaultCity, 'chorzow');
  assert.ok(panTadeusz.description.includes('Duża Scena'), 'Opis musi zawierać scenę');
  assert.ok(panTadeusz.description.includes('Ostatnie wolne miejsca'), 'Opis powinien odnotować status ostatnich wolnych miejsc');
  assert.ok(panTadeusz.description.includes('Pozostałe terminy: 2026-11-05 (11:30)'), 'Druga godzina tego samego dnia musi trafić do pozostałych terminów');
}
console.log('✅ parseTeatrRozrywki poprawnie pomija minione daty i pokazy z "Brak miejsc" oraz grupuje wielokrotne terminy spektakli.');

// ---------------------------------------------------------------------------
// 6. Priorytetyzacja w selectPromptItems i interleaveWebItems (NOSPR, Spodek, Teatr Śląski, Teatr Rozrywki)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Priorytetyzacja NOSPR, Spodka, Teatru Śląskiego i Teatru Rozrywki w selectPromptItems ---');

{
  assert.equal(isHighPriorityTicketSource({ sourceId: '7', sourceName: 'NOSPR (Kalendarz)' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '30', sourceName: 'NOSPR – Aktualności' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '5', sourceName: 'Spodek Katowice' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '10', sourceName: 'Teatr Śląski' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '11', sourceName: 'Teatr Rozrywki Chorzów' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '6', sourceName: 'MCK Katowice' }), false);

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
    ...Array.from({ length: 10 }, (_, i) => ({
      title: `Spektakl dla dzieci w Teatrze Ateneum nr ${i + 1}`,
      link: `https://ateneumteatr.pl/spektakle/bajka-${i + 1}`,
      sourceId: '15',
      sourceName: 'Teatr Ateneum',
      sourceType: 'WEB',
    })),
    // Źródła priorytetowe (NOSPR, Spodek, Teatr Śląski, Teatr Rozrywki)
    {
      title: 'Już opisany koncert w NOSPR z pierwszego tygodnia',
      link: 'https://nospr.org.pl/pl/kalendarz/juz-opisany-koncert',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-11-05',
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `Koncert w NOSPR w odległym miesiącu nr ${i + 1}`,
      link: `https://nospr.org.pl/pl/kalendarz/odlegly-koncert-${i + 1}`,
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: `2027-01-1${i}`,
    })),
    {
      title: 'Ogłoszenie o nowym cyklu koncertowym',
      link: 'https://nospr.org.pl/pl/aktualnosci/nowy-cykl',
      sourceId: '30',
      sourceName: 'NOSPR – Aktualności',
      sourceType: 'WEB',
      pubDate: '2026-10-31',
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      title: `Duży koncert w Spodku nr ${i + 1}`,
      link: `https://www.spodekkatowice.pl/pl/wydarzenia/koncert-${i + 1},${500 + i}.html`,
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
    ...Array.from({ length: 4 }, (_, i) => ({
      title: `Musical w Teatrze Rozrywki nr ${i + 1}`,
      link: `https://teatr-rozrywki.pl/repertuar/musical-${i + 1}.html?view=event`,
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      sourceType: 'WEB',
      eventDate: `2027-01-2${i}`,
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

  // Pierwsze 5 pozycji w puli WEB to dokładnie: [7] NOSPR, [30] NOSPR Aktualności, [5] Spodek, [10] Teatr Śląski, [11] Teatr Rozrywki
  assert.deepEqual(
    webInSelected.slice(0, 5).map((i) => i.sourceId),
    ['7', '30', '5', '10', '11'],
    'Na czele puli WEB muszą znaleźć się kolejno: NOSPR (Kalendarz), NOSPR – Aktualności, Spodek Katowice, Teatr Śląski i Teatr Rozrywki'
  );
  assert.ok(
    webInSelected.slice(0, 5).every((i) => i.highPriority === true),
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
console.log('✅ Priorytetyzacja w selectPromptItems (NOSPR -> Spodek -> Teatr Śląski -> Teatr Rozrywki) oraz ochrona pozostałych źródeł działają bezbłędnie.');

// ---------------------------------------------------------------------------
// 7. Automatyczne wymuszenie kategorii w validateArticle (nospr, spodek, teatr-rozrywki)
// ---------------------------------------------------------------------------
console.log('\n--- 7. Automatyczne wymuszenie kategorii w validateArticle ---');

{
  const sourceItems = [
    {
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      link: 'https://nospr.org.pl/pl/kalendarz/koncert-fortepianowy',
      pubDate: '2026-10-25',
      eventDate: '2027-01-15',
    },
    {
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      link: 'https://www.spodekkatowice.pl/pl/wydarzenia/wielki-koncert-rockowy,600.html',
      pubDate: '2026-10-20',
      eventDate: '2027-03-20',
    },
    {
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      link: 'https://teatr-rozrywki.pl/repertuar/musical-premierowy.html?view=event',
      pubDate: '2026-10-18',
      eventDate: '2026-12-10',
    },
    {
      sourceId: '22',
      sourceName: 'mojeKatowice.pl',
      link: 'https://mojekatowice.pl/artykul-remont',
      pubDate: '2026-10-30',
      eventDate: null,
    },
  ];

  // 1. Artykuł z NOSPR: mimo że model przekazał category: 'kultura', validateArticle wymusza 'nospr'
  const nosprArticle = validateArticle(
    {
      title: 'Koncert fortepianowy w NOSPR',
      city: 'katowice',
      category: 'kultura',
      status: 'published',
      isAlert: false,
      summary: 'Wyjątkowy koncert w Sali Koncertowej NOSPR.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/koncert-fortepianowy',
      location: 'NOSPR Katowice',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(nosprArticle.category, 'nospr', 'Artykuł z NOSPR musi otrzymać kategorię "nospr"');

  // 2. Artykuł ze Spodka: mimo category: 'wydarzenia', validateArticle wymusza 'spodek'
  const spodekArticle = validateArticle(
    {
      title: 'Wielki koncert rockowy w Spodku',
      city: 'katowice',
      category: 'wydarzenia',
      status: 'published',
      isAlert: false,
      summary: 'Legenda rocka w katowickim Spodku.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://www.spodekkatowice.pl/pl/wydarzenia/wielki-koncert-rockowy,600.html',
      location: 'Spodek Katowice',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(spodekArticle.category, 'spodek', 'Artykuł ze Spodka musi otrzymać kategorię "spodek"');

  // 3. Artykuł z Teatru Rozrywki: mimo category: 'kultura', validateArticle wymusza 'teatr-rozrywki'
  const trArticle = validateArticle(
    {
      title: 'Musical premierowy w Chorzowie',
      city: 'chorzow',
      category: 'kultura',
      status: 'published',
      isAlert: false,
      summary: 'Premiera musicalu na Dużej Scenie Teatru Rozrywki.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://teatr-rozrywki.pl/repertuar/musical-premierowy.html?view=event',
      location: 'Teatr Rozrywki w Chorzowie',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(trArticle.category, 'teatr-rozrywki', 'Artykuł z Teatru Rozrywki musi otrzymać kategorię "teatr-rozrywki"');

  // 4. Artykuł standardowy (mojeKatowice.pl) zachowuje przypisaną kategorię
  const standardArticle = validateArticle(
    {
      title: 'Remont ważnej arterii drogowej',
      city: 'katowice',
      category: 'drogi-komunikacja',
      status: 'published',
      isAlert: false,
      summary: 'Kierowcy muszą liczyć się z utrudnieniami.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://mojekatowice.pl/artykul-remont',
      location: 'Katowice, ul. Kościuszki',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(standardArticle.category, 'drogi-komunikacja', 'Standardowy artykuł zachowuje poprawną kategorię');
}
console.log('✅ validateArticle niezawodnie wymusza dedykowane kategorie (nospr, spodek, teatr-rozrywki).');

console.log('\n🎉 Wszystkie testy w test-priority-venues.mjs zakończone pełnym sukcesem (100% PASS)!\n');
