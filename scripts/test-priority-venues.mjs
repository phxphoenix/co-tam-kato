import assert from 'node:assert/strict';
import {
  MAX_ARTICLES,
  MAX_CANDIDATES,
  MAX_PROMPT_ITEMS,
  getUpcomingWarsawMonths,
  parseNosprKalendarz,
  parseNosprAktualnosci,
  parseTeatrSlaski,
  parseTeatrRozrywki,
  isTicketedVenueItem,
  isHighPriorityItem,
  isHighPriorityTicketSource,
  extractCycleName,
  interleaveWebItems,
  selectPromptItems,
  buildDigestPrompt,
  computeBalanceBudget,
  getVenueGroup,
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
// 6. Priorytetyzacja w selectPromptItems i interleaveWebItems (§5.2 i §5.3)
// ---------------------------------------------------------------------------
console.log('\n--- 6. Selektywne highPriority (§5.2) i limit lead w selectPromptItems (§5.3) ---');

{
  // isTicketedVenueItem bada przynależność do grupy biletowanej (4 instytucje)
  assert.equal(isTicketedVenueItem({ sourceId: '7', sourceName: 'NOSPR (Kalendarz)' }), true);
  assert.equal(isTicketedVenueItem({ sourceId: '30', sourceName: 'NOSPR – Aktualności' }), true);
  assert.equal(isTicketedVenueItem({ sourceId: '5', sourceName: 'Spodek Katowice' }), true);
  assert.equal(isTicketedVenueItem({ sourceId: '10', sourceName: 'Teatr Śląski' }), true);
  assert.equal(isTicketedVenueItem({ sourceId: '11', sourceName: 'Teatr Rozrywki Chorzów' }), true);
  assert.equal(isTicketedVenueItem({ sourceId: '6', sourceName: 'MCK Katowice' }), false);
  assert.equal(isHighPriorityTicketSource({ sourceId: '7', sourceName: 'NOSPR (Kalendarz)' }), true);
  assert.equal(isHighPriorityTicketSource({ sourceId: '6', sourceName: 'MCK Katowice' }), false);

  // isHighPriorityItem ustawia highPriority: true wyłącznie dla wyjątkowych pozycji (§5.2)
  assert.equal(
    isHighPriorityItem({
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Zwykły koncert symfoniczny',
      ticketStatus: 'Bilety w sprzedaży',
    }),
    false,
    'Zwykły koncert repertuarowy nie może mieć highPriority: true'
  );
  assert.equal(
    isHighPriorityItem({
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      title: 'Koncert kameralny',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    }),
    true,
    'Status "Ostatnie bilety" musi dawać highPriority: true'
  );
  assert.equal(
    isHighPriorityItem({
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      title: 'Koty',
      ticketStatus: 'Ostatnie wolne miejsca w sprzedaży',
    }),
    true,
    'Status "Ostatnie wolne miejsca" musi dawać highPriority: true'
  );
  assert.equal(
    isHighPriorityItem({
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      title: 'Premiera: Nowy spektakl',
      ticketStatus: 'Bilety w sprzedaży',
    }),
    true,
    'Słowo kluczowe "Premiera" musi dawać highPriority: true'
  );
  assert.equal(
    isHighPriorityItem({
      sourceId: '30',
      sourceName: 'NOSPR – Aktualności',
      title: 'Ogłoszenie o nowym cyklu koncertowym i sprzedaży biletów',
    }),
    true,
    'Aktualność NOSPR (ID 30) o sprzedaży biletów/sezonie musi dawać highPriority: true'
  );

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
    // Źródła biletowane (NOSPR, Spodek, Teatr Śląski, Teatr Rozrywki) – mieszanka highPriority i zwykłych
    {
      title: 'Już opisany koncert w NOSPR z pierwszego tygodnia',
      link: 'https://nospr.org.pl/pl/kalendarz/juz-opisany-koncert',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-11-05',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
    {
      title: 'Koncert finałowy w NOSPR – ostatnie bilety',
      link: 'https://nospr.org.pl/pl/kalendarz/koncert-finalowy',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-12-20',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      title: `Koncert w NOSPR w odległym miesiącu nr ${i + 1}`,
      link: `https://nospr.org.pl/pl/kalendarz/odlegly-koncert-${i + 1}`,
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: `2027-01-1${i}`,
      ticketStatus: 'Bilety w sprzedaży',
    })),
    {
      title: 'Ogłoszenie o nowym cyklu koncertowym',
      link: 'https://nospr.org.pl/pl/aktualnosci/nowy-cykl',
      sourceId: '30',
      sourceName: 'NOSPR – Aktualności',
      sourceType: 'WEB',
      pubDate: '2026-10-31',
    },
    {
      title: 'Wielka Gala Sylwestrowa w Spodku',
      link: 'https://www.spodekkatowice.pl/pl/wydarzenia/gala-sylwestrowa,499.html',
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      sourceType: 'WEB',
      eventDate: '2026-12-31',
      ticketStatus: 'Bilety w sprzedaży',
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      title: `Duży koncert w Spodku nr ${i + 1}`,
      link: `https://www.spodekkatowice.pl/pl/wydarzenia/koncert-${i + 1},${500 + i}.html`,
      sourceId: '5',
      sourceName: 'Spodek Katowice',
      sourceType: 'WEB',
      eventDate: `2027-02-1${i}`,
      ticketStatus: 'Bilety w sprzedaży',
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      title: `Premiera w Teatrze Śląskim nr ${i + 1}`,
      link: `https://teatrslaski.art.pl/repertuar/premiera-${i + 1}/`,
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      sourceType: 'WEB',
      eventDate: `2026-12-1${i}`,
      ticketStatus: 'Bilety w sprzedaży',
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      title: `Spektakl repertuarowy w Teatrze Śląskim nr ${i + 1}`,
      link: `https://teatrslaski.art.pl/repertuar/spektakl-${i + 1}/`,
      sourceId: '10',
      sourceName: 'Teatr Śląski',
      sourceType: 'WEB',
      eventDate: `2026-12-2${i}`,
      ticketStatus: 'Bilety w sprzedaży',
    })),
    {
      title: 'Musical w Teatrze Rozrywki – ostatnie wolne miejsca',
      link: 'https://teatr-rozrywki.pl/repertuar/musical-ostatnie.html?view=event',
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      sourceType: 'WEB',
      eventDate: '2027-01-15',
      ticketStatus: 'Ostatnie wolne miejsca w sprzedaży',
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      title: `Musical w Teatrze Rozrywki nr ${i + 1}`,
      link: `https://teatr-rozrywki.pl/repertuar/musical-${i + 1}.html?view=event`,
      sourceId: '11',
      sourceName: 'Teatr Rozrywki Chorzów',
      sourceType: 'WEB',
      eventDate: `2027-01-2${i}`,
      ticketStatus: 'Bilety w sprzedaży',
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

  const selected = selectPromptItems(candidatePool, existingArticles, {
    maxItems: MAX_PROMPT_ITEMS,
    now: new Date('2026-11-01T12:00:00Z'),
  });
  assert.equal(selected.length, 60, 'Łączna pula promptItems musi wynosić 60 pozycji');

  const rssInSelected = selected.filter((i) => i.sourceType === 'RSS');
  const webInSelected = selected.filter((i) => i.sourceType !== 'RSS');
  assert.equal(rssInSelected.length, 30, 'Połowa puli (30 pozycji) musi należeć do źródeł RSS');
  assert.equal(webInSelected.length, 30, 'Połowa puli (30 pozycji) musi należeć do źródeł WEB');

  // Już opisany koncert w NOSPR z pierwszego tygodnia nie może trafić do promptu
  assert.equal(
    webInSelected.some((i) => i.link.includes('juz-opisany-koncert')),
    false,
    'Już opublikowany koncert w NOSPR musi zostać odfiltrowany po URL'
  );

  // Pierwsze 5 pozycji w puli WEB to dokładnie: [7] NOSPR, [30] NOSPR Aktualności, [5] Spodek, [10] Teatr Śląski, [11] Teatr Rozrywki
  assert.deepEqual(
    webInSelected.slice(0, 5).map((i) => i.sourceId),
    ['7', '30', '5', '10', '11'],
    'Na czele puli WEB muszą znaleźć się kolejno pozycje highPriority z: NOSPR (Kalendarz), NOSPR – Aktualności, Spodek Katowice, Teatr Śląski i Teatr Rozrywki'
  );
  // 6. pozycja w lead to druga premiera z [10] Teatr Śląski (maxPriorityLeadItems = min(6, 30/4) = 6)
  assert.equal(webInSelected[5].sourceId, '10', '6. pozycja lead to kolejna pozycja highPriority (Premiera nr 2 z Teatru Śląskiego)');
  assert.ok(
    webInSelected.slice(0, 6).every((i) => i.highPriority === true),
    'Wszystkie pozycje w fazie lead (maks. 6) muszą posiadać flagę highPriority: true'
  );
  // 7. pozycja w puli WEB należy już do fazy 2 round-robin (standardowe źródło WEB [6] MCK), bo zwykłe koncerty biletowane mają highPriority: false
  assert.equal(
    webInSelected[6].sourceId,
    '6',
    'Po fazie lead (maks. 6 pozycji highPriority) do głosu dochodzą standardowe źródła WEB (MCK)'
  );

  // Zwykłe pozycje repertuarowe z NOSPR/Spodka/Teatru mają highPriority: false
  const regularNosprInSelected = webInSelected.filter(
    (i) => i.sourceId === '7' && i.title.startsWith('Koncert w NOSPR w odległym miesiącu')
  );
  assert.ok(regularNosprInSelected.length > 0, 'Zwykłe koncerty NOSPR nadal wchodzą do puli w fazie round-robin');
  assert.ok(
    regularNosprInSelected.every((i) => i.highPriority === false),
    'Zwykłe koncerty repertuarowe muszą mieć highPriority: false'
  );

  // Jednocześnie pozostałe źródła WEB (6 MCK, 15 Teatr Ateneum, 21 Stadion Śląski) są obecne w puli 30 WEB
  for (const requiredId of ['6', '15', '21']) {
    assert.ok(
      webInSelected.some((i) => i.sourceId === requiredId),
      `Standardowe źródło WEB [${requiredId}] musi zachować reprezentację w puli WEB`
    );
  }
}
console.log('✅ Selektywne highPriority (§5.2) i faza lead min(6, quota/4) w selectPromptItems (§5.3) działają bezbłędnie.');

// ---------------------------------------------------------------------------
// 7. Automatyczne wymuszenie kategorii w validateArticle (nospr, spodek, teatr-rozrywki, teatr-slaski)
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
      sourceId: '10',
      sourceName: 'Teatr Śląski Katowice',
      link: 'https://teatrslaski.art.pl/repertuar/hamlet/',
      pubDate: '2026-10-20',
      eventDate: '2026-12-15',
    },
    {
      sourceId: '21',
      sourceName: 'Stadion Śląski',
      link: 'https://stadionslaski.pl/wydarzenia/mecz-reprezentacji',
      pubDate: '2026-10-28',
      eventDate: '2026-11-18',
    },
    {
      sourceId: '23',
      sourceName: 'Muzeum Śląskie',
      link: 'https://muzeumslaskie.pl/pl/wystawy/nowa-wystawa',
      pubDate: '2026-10-29',
      eventDate: '2026-12-01',
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

  // 4. Artykuł z Teatru Śląskiego: mimo category: 'kultura', validateArticle wymusza 'teatr-slaski'
  const tsArticle = validateArticle(
    {
      title: 'Spektakl „Hamlet” w Teatrze Śląskim',
      city: 'katowice',
      category: 'kultura',
      status: 'published',
      isAlert: false,
      summary: 'Klasyczny dramat na Dużej Scenie Teatru Śląskiego.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://teatrslaski.art.pl/repertuar/hamlet/',
      location: 'Teatr Śląski – Duża Scena',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(tsArticle.category, 'teatr-slaski', 'Artykuł z Teatru Śląskiego musi otrzymać kategorię "teatr-slaski"');

  const tsByLocArticle = validateArticle(
    {
      title: 'Wydarzenie gościnne w Teatrze Śląskim',
      city: 'katowice',
      category: 'wydarzenia',
      status: 'published',
      isAlert: false,
      summary: 'Zaproszenie na spektakl na Scenie Kameralnej.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://mojekatowice.pl/artykul-remont',
      location: 'Teatr Slaski – Scena Kameralna',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(tsByLocArticle.category, 'teatr-slaski', 'Dopasowanie po location ("Teatr Slaski") musi wymusić "teatr-slaski"');

  const tsBySourceNameArticle = validateArticle(
    {
      title: 'Kameralna premiera w Katowicach',
      city: 'katowice',
      category: 'kultura',
      status: 'published',
      isAlert: false,
      summary: 'Nowość repertuarowa na Scenie w Malarni.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://teatrslaski.art.pl/repertuar/hamlet/',
      location: 'Scena w Malarni',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(tsBySourceNameArticle.category, 'teatr-slaski', 'Dopasowanie po sourceUrl/sourceName musi wymusić "teatr-slaski"');

  // 5. „Stadion Śląski” i „Muzeum Śląskie” NIE mogą otrzymać kategorii teatr-slaski
  const stadionArticle = validateArticle(
    {
      title: 'Mecz na Stadionie Śląskim',
      city: 'chorzow',
      category: 'sport',
      status: 'published',
      isAlert: false,
      summary: 'Wielkie sportowe emocje na Stadionie Śląskim.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://stadionslaski.pl/wydarzenia/mecz-reprezentacji',
      location: 'Stadion Śląski, Chorzów',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(stadionArticle.category, 'sport', 'Stadion Śląski musi zachować kategorię "sport"');

  const muzeumArticle = validateArticle(
    {
      title: 'Nowa wystawa w Muzeum Śląskim',
      city: 'katowice',
      category: 'kultura',
      status: 'published',
      isAlert: false,
      summary: 'Wernisaż wystawy czasowej w Muzeum Śląskim.',
      content: 'Akapit pierwszy.\n\nAkapit drugi.',
      sourceUrl: 'https://muzeumslaskie.pl/pl/wystawy/nowa-wystawa',
      location: 'Muzeum Śląskie w Katowicach',
    },
    sourceItems,
    new Date('2026-11-01T12:00:00Z')
  );
  assert.equal(muzeumArticle.category, 'kultura', 'Muzeum Śląskie musi zachować kategorię "kultura"');

  // 6. Artykuł standardowy (mojeKatowice.pl) zachowuje przypisaną kategorię
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
console.log('✅ validateArticle niezawodnie wymusza dedykowane kategorie (nospr, spodek, teatr-rozrywki, teatr-slaski) i nie myli innych obiektów śląskich.');

// ---------------------------------------------------------------------------
// 8. Klasyfikacja obiektów w getVenueGroup
// ---------------------------------------------------------------------------
console.log('\n--- 8. Testy jednostkowe getVenueGroup ---');

{
  assert.equal(getVenueGroup({ sourceUrl: 'https://nospr.org.pl/pl/kalendarz/1' }), 'nospr');
  assert.equal(getVenueGroup({ link: 'https://NOSPR.ORG.PL/pl/aktualnosci/1' }), 'nospr');
  assert.equal(getVenueGroup({ location: 'Sala Koncertowa NOSPR' }), 'nospr');
  assert.equal(getVenueGroup({ sourceName: 'NOSPR (Kalendarz)' }), 'nospr');

  assert.equal(getVenueGroup({ sourceUrl: 'https://www.spodekkatowice.pl/pl/wydarzenia/1' }), 'spodek');
  assert.equal(getVenueGroup({ location: 'Spodek Katowice' }), 'spodek');
  assert.equal(getVenueGroup({ sourceName: 'Spodek Katowice' }), 'spodek');

  assert.equal(getVenueGroup({ sourceUrl: 'https://teatr-rozrywki.pl/repertuar/1.html' }), 'teatr-rozrywki');
  assert.equal(getVenueGroup({ location: 'Teatr Rozrywki w Chorzowie' }), 'teatr-rozrywki');
  assert.equal(getVenueGroup({ sourceName: 'Teatr Rozrywki Chorzów' }), 'teatr-rozrywki');

  assert.equal(getVenueGroup({ sourceUrl: 'https://teatrslaski.art.pl/repertuar/hamlet/' }), 'teatr-slaski');
  assert.equal(getVenueGroup({ link: 'https://TEATRSLASKI.ART.PL/repertuar/carmen/' }), 'teatr-slaski');
  assert.equal(getVenueGroup({ location: 'Teatr Śląski – Scena w Malarni' }), 'teatr-slaski');
  assert.equal(getVenueGroup({ location: 'Teatr Slaski, Duza Scena' }), 'teatr-slaski');
  assert.equal(getVenueGroup({ sourceName: 'Teatr Śląski Katowice' }), 'teatr-slaski');

  // Kolejność reguł (§1 spec): nospr > spodek > teatr-rozrywki > teatr-slaski
  assert.equal(
    getVenueGroup({ sourceUrl: 'https://nospr.org.pl/pl/kalendarz/x', location: 'Spodek' }),
    'nospr',
    'Reguła nospr ma pierwszeństwo przed spodek'
  );
  assert.equal(
    getVenueGroup({ sourceUrl: 'https://spodekkatowice.pl/x', location: 'Teatr Rozrywki' }),
    'spodek',
    'Reguła spodek ma pierwszeństwo przed teatr-rozrywki'
  );
  assert.equal(
    getVenueGroup({ sourceUrl: 'https://teatr-rozrywki.pl/x', location: 'Teatr Śląski' }),
    'teatr-rozrywki',
    'Reguła teatr-rozrywki ma pierwszeństwo przed teatr-slaski'
  );

  // Obiekty śląskie niebędące Teatrem Śląskim -> 'other'
  assert.equal(getVenueGroup({ sourceUrl: 'https://stadionslaski.pl/a', location: 'Stadion Śląski', sourceName: 'Stadion Śląski' }), 'other');
  assert.equal(getVenueGroup({ sourceUrl: 'https://parkslaski.pl/a', location: 'Park Śląski', sourceName: 'Park Śląski' }), 'other');
  assert.equal(getVenueGroup({ sourceUrl: 'https://muzeumslaskie.pl/a', location: 'Muzeum Śląskie', sourceName: 'Muzeum Śląskie' }), 'other');
  assert.equal(getVenueGroup({ sourceUrl: 'https://ateneumteatr.pl/a', location: 'Śląski Teatr Lalki i Aktora Ateneum' }), 'other');
  assert.equal(getVenueGroup({ sourceUrl: 'https://mojekatowice.pl/a', location: 'Katowice' }), 'other');
  assert.equal(getVenueGroup(null), 'other');
  assert.equal(getVenueGroup(undefined), 'other');
}
console.log('✅ getVenueGroup poprawnie klasyfikuje obiekty oraz zachowuje kolejność reguł i wykluczenia.');

// ---------------------------------------------------------------------------
// 9. Dynamiczny prompt równowagi w buildDigestPrompt (§5.1)
// ---------------------------------------------------------------------------
console.log('\n--- 9. Dynamiczny prompt w buildDigestPrompt (§5.1: brak "co najmniej 1–2", blok RÓWNOWAGA) ---');

{
  const now = new Date('2026-11-11T12:00:00Z');
  const existingEmpty = [];
  const budgetFloor = computeBalanceBudget(existingEmpty, undefined, now);
  assert.equal(budgetFloor.floorRequired, true);
  assert.equal(budgetFloor.ticketedAllowed, 2);
  assert.equal(budgetFloor.nosprAllowed, 1);

  const promptFloor = buildDigestPrompt([], existingEmpty, {
    now,
    budget: budgetFloor,
    maxCandidates: MAX_CANDIDATES,
  });

  assert.equal(
    promptFloor.includes('co najmniej 1–2'),
    false,
    'Prompt nie może zawierać dawnej instrukcji "co najmniej 1–2"'
  );
  assert.equal(
    promptFloor.includes('PRIORYTET REDAKCYJNY – WCZESNE OSTRZEGANIE O BILETACH'),
    false,
    'Prompt nie może zawierać usuniętego bloku PRIORYTET REDAKCYJNY'
  );
  assert.equal(
    promptFloor.includes('Najwyższy priorytet spośród instytucji kultury ma'),
    false,
    'Prompt nie może zawierać sztywnego priorytetu NOSPR'
  );
  assert.ok(
    promptFloor.includes('wydarzenia biletowane z dostępnymi biletami warto zapowiadać z wyprzedzeniem, w ramach limitu z bloku RÓWNOWAGA'),
    'Prompt musi zawierać łagodną zasadę wczesnego informowania o biletach w ramach limitu RÓWNOWAGA'
  );
  assert.ok(
    promptFloor.includes('RÓWNOWAGA TEMATYCZNA (dane z systemu, obowiązujące):'),
    'Prompt musi zawierać nagłówek bloku RÓWNOWAGA TEMATYCZNA'
  );
  assert.ok(
    promptFloor.includes('w tym cyklu system przyjmie maks. 2 (NOSPR maks. 1). Dziś nie było jeszcze żadnego – umieść co najmniej 1 taki kandydat wysoko w rankingu (najlepiej z „Ostatnimi biletami”).'),
    'Prompt przy floorRequired=true musi informować o brakującym dzisiejszym wpisie ticketed'
  );

  // Scenariusz z wyczerpanym budżetem dziennym (2 wpisy ticketed dzisiaj, w tym 1 NOSPR)
  const existingFull = [
    {
      title: 'Koncert symfoniczny w NOSPR',
      category: 'nospr',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/k1',
      addedDate: '2026-11-11',
      publishedDate: '2026-11-11',
      aiGenerated: true,
      status: 'published',
    },
    {
      title: 'Premiera w Teatrze Śląskim',
      category: 'teatr-slaski',
      sourceUrl: 'https://teatrslaski.art.pl/repertuar/s1',
      addedDate: '2026-11-11',
      publishedDate: '2026-11-11',
      aiGenerated: true,
      status: 'published',
    },
    {
      title: 'Remont ulicy w Katowicach',
      category: 'drogi-komunikacja',
      sourceUrl: 'https://mojekatowice.pl/d1',
      addedDate: '2026-11-10',
      publishedDate: '2026-11-10',
      aiGenerated: true,
      status: 'published',
    },
    {
      title: 'Koncert w Spodku',
      category: 'spodek',
      sourceUrl: 'https://spodekkatowice.pl/s1',
      addedDate: '2026-11-10',
      publishedDate: '2026-11-10',
      aiGenerated: true,
      status: 'published',
    },
  ];
  const budgetZero = computeBalanceBudget(existingFull, undefined, now);
  assert.equal(budgetZero.ticketedAllowed, 0);
  assert.equal(budgetZero.nosprAllowed, 0);
  assert.equal(budgetZero.floorRequired, false);

  const promptZero = buildDigestPrompt([], existingFull, {
    now,
    budget: budgetZero,
  });

  assert.ok(
    promptZero.includes('w tym cyklu system przyjmie maks. 0 (NOSPR maks. 0).'),
    'Prompt przy wyczerpanym budżecie musi podawać maks. 0 (NOSPR maks. 0)'
  );
  assert.equal(
    promptZero.includes('Dziś nie było jeszcze żadnego'),
    false,
    'Prompt przy floorRequired=false nie może zawierać dopisku o braku dzisiejszego wpisu'
  );
  assert.ok(
    promptZero.includes(JSON.stringify(budgetZero.stats.byCategory3d)),
    'Prompt musi zawierać statystyki kategorii z ostatnich 3 dni'
  );
}
console.log('✅ buildDigestPrompt generuje dynamiczny blok RÓWNOWAGA TEMATYCZNA z poprawnymi liczbami i bez sztywnego "co najmniej 1–2".');

// ---------------------------------------------------------------------------
// 10. Limit pozycji na źródło biletowane, sortowanie i redukcja przy ticketedAllowed=0 (§5.3)
// ---------------------------------------------------------------------------
console.log('\n--- 10. Limit pozycji na źródło biletowane, sortowanie urgent->highPriority->data i redukcja do 2 (§5.3) ---');

{
  const now = new Date('2026-11-01T12:00:00Z');
  const nosprItems = [
    // Zwykły odległy
    {
      title: 'Koncert symfoniczny późny',
      link: 'https://nospr.org.pl/pl/kalendarz/pozny',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2027-01-25',
      ticketStatus: 'Bilety w sprzedaży',
    },
    // Zwykły wcześniejszy
    {
      title: 'Koncert symfoniczny wcześniejszy',
      link: 'https://nospr.org.pl/pl/kalendarz/wczesny',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-12-05',
      ticketStatus: 'Bilety w sprzedaży',
    },
    // HighPriority (nie-urgent, bo za >14 dni)
    {
      title: 'Wielka Gala Sylwestrowa',
      link: 'https://nospr.org.pl/pl/kalendarz/gala',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-12-31',
      ticketStatus: 'Bilety w sprzedaży',
    },
    // Urgent (Ostatnie bilety + <=14 dni)
    {
      title: 'Recital mistrzowski – ostatnie bilety',
      link: 'https://nospr.org.pl/pl/kalendarz/urgent-recital',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-11-08',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      title: `Dodatkowy koncert w NOSPR nr ${i + 1}`,
      link: `https://nospr.org.pl/pl/kalendarz/dodatkowy-${i + 1}`,
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: `2027-01-1${i}`,
      ticketStatus: 'Bilety w sprzedaży',
    })),
  ];

  // 1) Przy normalnym budżecie (ticketedAllowed > 0): maks. 5 pozycji z jednego źródła biletowanego,
  // posortowane: urgent -> highPriority -> najbliższa data.
  const interleavedNormal = interleaveWebItems(nosprItems, {
    now,
    budget: { ticketedAllowed: 1, nosprAllowed: 1 },
  });
  assert.equal(
    interleavedNormal.length,
    5,
    'Liczba pozycji z jednego źródła biletowanego musi być ograniczona do poolMaxItemsPerTicketedSource (5)'
  );
  assert.equal(interleavedNormal[0].link, 'https://nospr.org.pl/pl/kalendarz/urgent-recital', '1. pozycja: urgent');
  assert.equal(interleavedNormal[1].link, 'https://nospr.org.pl/pl/kalendarz/gala', '2. pozycja: highPriority');
  assert.equal(interleavedNormal[2].link, 'https://nospr.org.pl/pl/kalendarz/wczesny', '3. pozycja: najwcześniejsza data wśród zwykłych');

  // 2) Gdy ticketedAllowed === 0 i brak urgent: redukcja do maks. 2 pozycji na źródło biletowane
  const nonUrgentNospr = nosprItems.filter((i) => !i.link.includes('urgent-recital'));
  const mckItems = Array.from({ length: 10 }, (_, i) => ({
    title: `Wydarzenie w MCK nr ${i + 1}`,
    link: `https://www.mckkatowice.pl/pl/wydarzenia/mck-${i + 1}.html`,
    sourceId: '6',
    sourceName: 'MCK Katowice',
    sourceType: 'WEB',
  }));

  const interleavedZeroBudget = interleaveWebItems([...nonUrgentNospr, ...mckItems], {
    now,
    budget: { ticketedAllowed: 0, nosprAllowed: 0 },
  });
  const nosprInZeroBudget = interleavedZeroBudget.filter((i) => i.sourceId === '7');
  assert.equal(
    nosprInZeroBudget.length,
    2,
    'Gdy ticketedAllowed === 0 i brak urgent, liczba pozycji ze źródła biletowanego musi spaść do maks. 2'
  );
}
console.log('✅ Limit na źródło biletowane (5), sortowanie (urgent -> highPriority -> data) i redukcja do 2 przy budżecie 0 działają poprawnie.');

// ---------------------------------------------------------------------------
// 11. Filtr cykli (cycleCooldownDays) oraz wyjątek urgent (§5.3 pkt 4)
// ---------------------------------------------------------------------------
console.log('\n--- 11. Filtr powtarzalnych cykli (cycleCooldownDays) z wyjątkiem dla urgent (§5.3) ---');

{
  const now = new Date('2026-11-11T12:00:00Z');

  // Ekstrakcja nazwy cyklu z opisu parsera i z prefiksu tytułu przed ':' lub '/'
  assert.equal(
    extractCycleName({
      title: 'Urban Jazz Night',
      description: 'Wydarzenie w NOSPR: Urban Jazz Night. Cykl/kategoria: JazzKLUB. Status biletów: Bilety w sprzedaży.',
    }),
    'JazzKLUB'
  );
  assert.equal(extractCycleName({ title: 'JazzKLUB: Marcin Wasilewski Trio' }), 'JazzKLUB');
  assert.equal(extractCycleName({ title: 'Czwartki organowe / Recital organowy' }), 'Czwartki organowe');
  assert.equal(extractCycleName({ title: 'NOSPR kameralnie: Kwartet Śląski' }), 'NOSPR kameralnie');
  assert.equal(extractCycleName({ title: 'Muzyka bez granic: Koncert wieczorny' }), 'Muzyka bez granic');
  assert.equal(extractCycleName({ title: 'NOSPR / Requiem Mozarta' }), null, 'Sama nazwa obiektu przed "/" nie jest cyklem');

  const recentArticles = [
    {
      title: 'JazzKLUB: Raphael Rogiński w katowickiej NOSPR',
      summary: 'W ramach cyklu JazzKLUB wystąpi Raphael Rogiński.',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/jazzklub-raphael-roginski',
      addedDate: '2026-11-08', // 3 dni temu (w oknie cycleCooldownDays = 7)
      publishedDate: '2026-11-08',
      status: 'published',
      aiGenerated: true,
    },
    {
      title: 'Czwartki organowe: Stary recital sprzed miesiąca',
      sourceUrl: 'https://nospr.org.pl/pl/kalendarz/czwartki-organowe-stary',
      addedDate: '2026-10-15', // > 7 dni temu (poza oknem cooldown)
      publishedDate: '2026-10-15',
      status: 'published',
      aiGenerated: true,
    },
  ];

  const poolWithCycles = [
    // Kolejna odsłona cyklu JazzKLUB (nie-urgent, za 2 miesiące) -> powinna zostać pominięta!
    {
      title: 'Urban Jazz Night 2',
      link: 'https://nospr.org.pl/pl/kalendarz/jazzklub-kolejny',
      description: 'Wydarzenie w NOSPR: Urban Jazz Night 2. Cykl/kategoria: JazzKLUB. Status biletów: Bilety w sprzedaży.',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2027-01-12',
      ticketStatus: 'Bilety w sprzedaży',
    },
    // Kolejna odsłona cyklu Czwartki organowe (poprzedni wpis > 7 dni temu) -> powinna przejść!
    {
      title: 'Czwartki organowe: Listopadowy recital',
      link: 'https://nospr.org.pl/pl/kalendarz/czwartki-organowe-listopad',
      description: 'Wydarzenie w NOSPR. Cykl/kategoria: Czwartki organowe. Status biletów: Bilety w sprzedaży.',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-12-10',
      ticketStatus: 'Bilety w sprzedaży',
    },
    // Odsłona cyklu JazzKLUB, ale URGENT (Ostatnie bilety + eventDate <= 14 dni) -> wyjątek urgent, musi przejść!
    {
      title: 'JazzKLUB: Pilny koncert specjalny',
      link: 'https://nospr.org.pl/pl/kalendarz/jazzklub-pilny',
      description: 'Wydarzenie w NOSPR. Cykl/kategoria: JazzKLUB. Status biletów: Ostatnie bilety w sprzedaży.',
      sourceId: '7',
      sourceName: 'NOSPR (Kalendarz)',
      sourceType: 'WEB',
      eventDate: '2026-11-18',
      ticketStatus: 'Ostatnie bilety w sprzedaży',
    },
  ];

  const filteredPool = selectPromptItems(poolWithCycles, recentArticles, { now });

  assert.equal(
    filteredPool.some((i) => i.link.includes('jazzklub-kolejny')),
    false,
    'Zwykła odsłona cyklu JazzKLUB opublikowanego 3 dni temu musi zostać pominięta przez filtr cykli'
  );
  assert.equal(
    filteredPool.some((i) => i.link.includes('czwartki-organowe-listopad')),
    true,
    'Cykl opublikowany ponad cycleCooldownDays (7) dni temu musi zostać dopuszczony'
  );
  assert.equal(
    filteredPool.some((i) => i.link.includes('jazzklub-pilny')),
    true,
    'Pozycja urgent ("Ostatnie bilety" w ciągu <=14 dni) musi przejść mimo aktywnego cooldownu cyklu'
  );
}
console.log('✅ Filtr cykli (cycleCooldownDays) oraz wyjątek dla pozycji urgent działają zgodnie ze specyfikacją.');

console.log('\n🎉 Wszystkie testy w test-priority-venues.mjs zakończone pełnym sukcesem (100% PASS)!\n');
