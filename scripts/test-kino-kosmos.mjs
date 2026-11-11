import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  parseKinoKosmos,
  processSource,
  getVenueGroup,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parsera Kino Kosmos (id 13)');
console.log('======================================================\n');

const fixtureHtml = fs.readFileSync(path.resolve('scripts/fixtures/kino-kosmos.html'), 'utf8');
const now = new Date('2026-11-11T12:00:00Z');

// Dodajmy syntetyczny przeszły seans specjalny z 05.11, aby sprawdzić filtrowanie przeszłości
const fixtureWithPast = fixtureHtml.replace(
  '</div>\n</div>',
  `<div class="sala-item swiper-slide" data-date="20261105" data-full-date="2026-11-05 18:00:00" data-event="999999">
    <div class="sala-item-godz">18:00</div>
    <a href="javascript:;" class="sala-item-link" data-url="https://kosmos.katowice.pl/repertuar/miniony-przeglad/" data-title="Miniony przegląd z prelekcją">
      <h2 class="sala-item-title">Miniony przegląd z prelekcją</h2>
      <h3 class="sala-item-cykl">Wydarzenia specjalne</h3>
    </a>
  </div>
</div>\n</div>`
);

const items = parseKinoKosmos(fixtureWithPast, 'https://kosmos.katowice.pl/repertuar/', { now });

// 1. Zwykłe seanse bez dodatków muszą zostać pominięte
assert.equal(items.some((i) => i.title.includes('Witajcie w Hope')), false, 'Zwykły seans "Witajcie w Hope" musi być pominięty');
assert.equal(items.some((i) => i.title.includes('Trzy pożegnania')), false, 'Zwykły seans "Trzy pożegnania" musi być pominięty');

// 2. Minione wydarzenie specjalne musi zostać odrzucone
assert.equal(items.some((i) => i.title.includes('Miniony przegląd')), false, 'Przeszły seans specjalny z 05.11 musi być odrzucony');

// 3. Zachowanie wszystkich 5 typów wydarzeń specjalnych z fixture
assert.equal(items.length, 5, `Oczekiwano 5 wydarzeń specjalnych, otrzymano ${items.length}`);

const coolFest = items.find((i) => i.title.includes('COOL FILM FEST'));
assert.ok(coolFest, 'COOL FILM FEST musi być zachowany');
assert.equal(coolFest.eventDate, '2026-11-13');
assert.ok(coolFest.link.startsWith('https://kosmos.katowice.pl/repertuar/'));
assert.ok(coolFest.description.includes('18:30') && coolFest.description.includes('Solaris'), 'Opis musi zawierać godzinę i salę');

const rodzina = items.find((i) => i.title.includes('Rodzina w kinie'));
assert.ok(rodzina, 'Cykl "Rodzina w kinie" musi być zachowany');
assert.equal(rodzina.isForKids, true);
assert.equal(rodzina.defaultCategory, 'dla-dzieci');

const senior = items.find((i) => i.title.includes('PORA DLA SENIORA'));
assert.ok(senior, 'Cykl "Pora dla seniora" musi być zachowany');
assert.equal(senior.isForKids, false);
assert.equal(senior.defaultCategory, 'kultura');
assert.ok(senior.description.includes('Cykl dla seniorów'));

const prelekcja = items.find((i) => i.title.includes('Lalka + prelekcja'));
assert.ok(prelekcja, 'Seans specjalny z prelekcją (bez osobnego tagu cyklu) musi być zachowany');

const ars = items.find((i) => i.title.includes('Festiwal Ars Cameralis'));
assert.ok(ars, 'Seans w ramach Festiwalu Ars Cameralis musi być zachowany');

assert.equal(getVenueGroup({ sourceUrl: coolFest.link, location: 'Kino Kosmos', sourceName: 'Kino Kosmos' }), 'other');
for (const item of items) {
  assert.notEqual(item.highPriority, true, 'Kino Kosmos nie może otrzymywać highPriority');
}
console.log('✅ Fixture Kino Kosmos: filtruje zwykłe seanse i przeszłe daty, wyodrębnia przeglądy, prelekcje, cykle dla dzieci i seniorów.');

// 4. Test na żywo processSource([13] Kino Kosmos)
const kosmosSource = loadActiveSources().find((s) => s.id === '13');
assert.ok(kosmosSource, 'Źródło ID 13 musi być aktywne');
const liveItems = await processSource(kosmosSource);
assert.ok(Array.isArray(liveItems) && liveItems.length >= 10, `Oczekiwano >= 10 wydarzeń specjalnych z Kina Kosmos, otrzymano ${liveItems.length}`);
assert.equal(liveItems.some((i) => i.title === 'Witajcie w Hope'), false, 'Na żywo zwykły seans nie może trafić do wyników');
console.log(`✅ Live processSource([13] Kino Kosmos): pobrano ${liveItems.length} wydarzeń specjalnych.`);

console.log('\n🎉 Wszystkie testy Kina Kosmos zakończone sukcesem!\n');
