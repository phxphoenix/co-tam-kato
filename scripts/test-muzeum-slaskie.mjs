import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  parseMuzeumSlaskie,
  resolveSeasonPolishDate,
  processSource,
  getVenueGroup,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parsera Muzeum Śląskie (id 8)');
console.log('======================================================\n');

const now = new Date('2026-11-11T12:00:00Z');

// 1. Rozwiązywanie dat sezonowych (rok bieżący vs następny)
assert.equal(resolveSeasonPolishDate('5 grudnia', now), '2026-12-05');
assert.equal(resolveSeasonPolishDate('9 stycznia', now), '2027-01-09');
assert.equal(resolveSeasonPolishDate('21 sierpnia', now), '2026-08-21');
console.log('✅ resolveSeasonPolishDate poprawnie przypisuje rok dla jesieni 2026 i zimy/wiosny 2027.');

// 2. Fixture scripts/fixtures/muzeum-slaskie.html (5 akordeonów: 1 całkowicie przeszły + 4 aktywne)
const fixtureHtml = fs.readFileSync(path.resolve('scripts/fixtures/muzeum-slaskie.html'), 'utf8');
const items = parseMuzeumSlaskie(
  fixtureHtml,
  'https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/',
  { now }
);

assert.equal(
  items.some((i) => i.title.includes('Oprowadzania kuratorskie')),
  false,
  'Cykl ze wszystkimi datami w przeszłości (sierpień–wrzesień) musi zostać odrzucony'
);
assert.equal(items.length, 4, `Oczekiwano 4 cykle z nadchodzącymi terminami, otrzymano ${items.length}`);

const sztukaStart = items.find((i) => i.title.includes('Sztuka na start'));
assert.ok(sztukaStart, 'Cykl "Sztuka na start" musi być obecny');
assert.equal(sztukaStart.eventDate, '2026-11-14', 'Najbliższy termin po 11.11 to 14 listopada (7 listopada/października pominięte)');
assert.equal(sztukaStart.isForKids, true);
assert.equal(sztukaStart.defaultCategory, 'dla-dzieci');
assert.equal(sztukaStart.ageRange, '6-9 lat');
assert.ok(sztukaStart.link.includes('#elementor-tab-title-8823'), 'Link musi kierować do kotwicy konkretnego akordeonu');
assert.ok(sztukaStart.description.includes('11:00'), 'Opis musi zawierać godzinę warsztatów');
assert.ok(sztukaStart.description.includes('2026-12-12') && sztukaStart.description.includes('2027-01-16'), 'Opis musi zawierać kolejne terminy wraz z przejściem roku');

const zagadka = items.find((i) => i.title.includes('Zagadka dla kilkulatka'));
assert.ok(zagadka, 'Cykl "Zagadka dla kilkulatka" musi być obecny');
assert.equal(zagadka.eventDate, '2026-12-05', '7 listopada jest w przeszłości, więc najbliższy termin to 5 grudnia');
assert.equal(zagadka.ageRange, '3-5 lat');

const senior = items.find((i) => i.title.includes('Muzealny Uniwersytet Seniora'));
assert.ok(senior, 'Cykl dla seniorów musi być obecny');
assert.equal(senior.eventDate, '2026-11-26');
assert.equal(senior.isForKids, false);
assert.equal(senior.defaultCategory, 'kultura');

assert.equal(getVenueGroup({ sourceUrl: sztukaStart.link, location: 'Muzeum Śląskie', sourceName: 'Muzeum Śląskie' }), 'other');
for (const item of items) {
  assert.notEqual(item.highPriority, true, 'Muzeum Śląskie nie należy do grupy biletowanej');
}
console.log('✅ Fixture Muzeum Śląskie: poprawne daty sezonowe, godziny, linki kotwicowe, wiek i odrzucanie przeszłych.');

// 3. Test na żywo processSource([8] Muzeum Śląskie)
const muzeumSource = loadActiveSources().find((s) => s.id === '8');
assert.ok(muzeumSource, 'Źródło ID 8 musi być aktywne');
const liveItems = await processSource(muzeumSource);
assert.ok(Array.isArray(liveItems) && liveItems.length >= 5, `Oczekiwano >= 5 nadchodzących cykli z Muzeum Śląskiego, otrzymano ${liveItems.length}`);
console.log(`✅ Live processSource([8] Muzeum Śląskie): pobrano ${liveItems.length} pozycji.`);

console.log('\n🎉 Wszystkie testy Muzeum Śląskiego zakończone sukcesem!\n');
