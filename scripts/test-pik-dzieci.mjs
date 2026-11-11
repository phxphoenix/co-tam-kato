import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  parsePikDzieci,
  processSource,
  validateArticle,
  getVenueGroup,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parsera PIK Katowice – Dzieci (id 14)');
console.log('======================================================\n');

const fixtureHtml = fs.readFileSync(path.resolve('scripts/fixtures/pik-dzieci.html'), 'utf8');

// 1. Test na dniu 2026-11-11: odrzuca przeszłe (8.11 i 27.09), zachowuje 11.11 i 13.11
const itemsNov = parsePikDzieci(fixtureHtml, 'https://pik.katowice.pl/dzieci/', {
  now: new Date('2026-11-11T12:00:00Z'),
});

assert.equal(itemsNov.length, 2, `Oczekiwano 2 nadchodzące wydarzenia na 11.11, otrzymano ${itemsNov.length}`);
assert.equal(itemsNov.some((i) => i.title.includes('Yellowstone')), false, 'Przeszłe wydarzenie (pik-past-event / 8.11) musi być odrzucone');
assert.equal(itemsNov.some((i) => i.title.includes('Cukierku')), false, 'Przeszłe wydarzenie (27.09) musi być odrzucone');

const armia = itemsNov.find((i) => i.title.includes('Mała Armia Janosika'));
assert.ok(armia, 'Dzisiejsze wydarzenie 11.11 musi zostać zachowane');
assert.equal(armia.eventDate, '2026-11-11');
assert.equal(armia.link, 'https://pik.katowice.pl/mala-armia-janosika-koncert-slask/');
assert.equal(armia.defaultCity, 'cala-okolica', 'Wydarzenie w Zabrzu musi mieć defaultCity: cala-okolica');
assert.equal(armia.defaultCategory, 'dla-dzieci');
assert.equal(armia.isForKids, true);
assert.notEqual(armia.highPriority, true);
assert.ok(!armia.title.includes('&#8211;'), 'Encje HTML w tytule muszą zostać zdekodowane');

const magia = itemsNov.find((i) => i.title.includes('Teatr Magii Macieja Pola'));
assert.ok(magia, 'Przyszłe wydarzenie 13.11 musi zostać zachowane');
assert.equal(magia.eventDate, '2026-11-13');
assert.equal(magia.defaultCity, 'katowice');
assert.equal(magia.defaultCategory, 'dla-dzieci');
assert.equal(magia.isForKids, true);
assert.ok(magia.description.includes('12:00'), 'Opis musi zawierać godzinę wydarzenia');
console.log('✅ Fixture PIK Dzieci (2026-11-11): poprawne eventDate, bezpośredni link, dekodowanie encji, isForKids/dla-dzieci i odrzucanie przeszłych.');

// 2. Test ekstrakcji wieku uczestników (27.09 oraz syntetyczny wiek "3-6 lat")
const ageSampleHtml = fixtureHtml.replace(
  'Interaktywne Familijne Widowisko Najsłynniejszego Polskiego Iluzjonisty odwiedzi Katowice.',
  'Interaktywne widowisko dla dzieci 3-6 lat w Katowicach.'
);
const itemsSep = parsePikDzieci(ageSampleHtml, 'https://pik.katowice.pl/dzieci/', {
  now: new Date('2026-09-25T12:00:00Z'),
});
const magiaWithAge = itemsSep.find((i) => i.title.includes('Teatr Magii'));
assert.equal(magiaWithAge?.ageRange, '3-6 lat', 'Parser musi wyciągać przedział wieku (np. 3-6 lat)');
assert.ok(magiaWithAge?.description.includes('Wiek uczestników: 3-6 lat'), 'Opis musi zawierać wiek uczestników');

const cukierku = itemsSep.find((i) => i.title.includes('Cukierku Ty Łobuzie'));
assert.ok(cukierku, 'Cukierku Ty Łobuzie z 27.09 musi być obecne dla daty 25.09');
assert.equal(cukierku.eventDate, '2026-09-27');
assert.ok(cukierku.ageRange && cukierku.ageRange.toLowerCase().includes('szkoła podstawowa'), 'Parser musi rozpoznać etap edukacyjny w opisie');
console.log('✅ Ekstrakcja wieku uczestników (ageRange + opis) działa poprawnie.');

// 3. venueGroup === 'other' i walidacja artykułu
assert.equal(getVenueGroup({ sourceUrl: magia.link, location: 'Katowice', sourceName: 'PIK Katowice – Dzieci' }), 'other');
const validated = validateArticle(
  {
    title: 'Teatr Magii Macieja Pola w Katowicach',
    city: 'katowice',
    category: 'wydarzenia',
    status: 'published',
    eventDate: '2026-11-13',
    summary: 'Familijne widowisko iluzjonisty Macieja Pola w Katowicach.',
    location: 'Katowice',
    isAlert: false,
    isForKids: false,
    sourceUrl: magia.link,
    content: 'Zapraszamy rodziny z dziećmi na pokaz iluzji.',
  },
  [magiaWithAge],
  new Date('2026-11-11T12:00:00Z')
);
assert.equal(validated.category, 'dla-dzieci', 'validateArticle musi utrzymać defaultCategory dla-dzieci');
assert.equal(validated.isForKids, true, 'validateArticle musi ustawić isForKids: true');
assert.equal(validated.ageRange, '3-6 lat', 'validateArticle musi przejąć ageRange z parsera, jeśli AI go nie podało');
console.log('✅ validateArticle zachowuje isForKids: true, category: dla-dzieci i ageRange.');

// 4. Test na żywo processSource([14] PIK Katowice – Dzieci)
const pikSource = loadActiveSources().find((s) => s.id === '14');
assert.ok(pikSource, 'Źródło ID 14 musi być aktywne');
const liveItems = await processSource(pikSource);
assert.ok(Array.isArray(liveItems) && liveItems.length >= 1, 'Na żywo oczekiwano >= 1 pozycji z PIK Dzieci');
console.log(`✅ Live processSource([14] PIK Katowice – Dzieci): pobrano ${liveItems.length} pozycji.`);

console.log('\n🎉 Wszystkie testy PIK Katowice – Dzieci zakończone sukcesem!\n');
