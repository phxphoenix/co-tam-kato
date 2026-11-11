import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  parseTeatrAteneum,
  processSource,
  getVenueGroup,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parsera Teatr Ateneum (id 15)');
console.log('======================================================\n');

const fixtureHtml = fs.readFileSync(path.resolve('scripts/fixtures/teatr-ateneum.html'), 'utf8');
const now = new Date('2026-11-11T12:00:00Z');

const items = parseTeatrAteneum(fixtureHtml, 'https://ateneumteatr.pl/events/', { now });

// 1. Odrzuca "Widownia w remoncie" oraz przeszłe daty (26.10, 27.10, 29.10, 03.11, 04.11)
assert.equal(items.some((i) => i.title.includes('Widownia w remoncie')), false, 'Komunikat techniczny Widownia w remoncie musi być pominięty');
assert.equal(items.some((i) => i.title === 'INNY'), false, 'Przeszły spektakl z 26.10 musi być odrzucony');
assert.equal(items.some((i) => i.title.includes('Ballady i romanse')), false, 'Przeszły spektakl z 04.11 musi być odrzucony');

// 2. Grupuje powtórki: Pan Tom (14-15.11), Czwórka (25-26.11), Opowieść Złotej Rybki (1-5.12), Opowieść z Mikołajem (6.12)
assert.equal(items.length, 4, `Oczekiwano 4 zgrupowane tytuły spektakli, otrzymano ${items.length}`);

const panTom = items.find((i) => i.title === 'Pan Tom buduje dom');
assert.ok(panTom, 'Spektakl "Pan Tom buduje dom" musi być obecny');
assert.equal(panTom.eventDate, '2026-11-14');
assert.ok(panTom.description.includes('16:00'), 'Opis musi zawierać godzinę 16:00');
assert.ok(panTom.description.includes('Dom Kultury na Witosa'), 'Opis musi zawierać nazwę sceny');
assert.ok(panTom.description.includes('Kwiatkowskiego 32'), 'Opis musi zawierać adres sceny');
assert.ok(panTom.description.includes('2026-11-15 (16:00)'), 'Opis musi zawierać kolejny termin spektaklu');
assert.equal(panTom.defaultCategory, 'dla-dzieci');
assert.equal(panTom.isForKids, true);
assert.equal(panTom.defaultCity, 'katowice');
assert.notEqual(panTom.highPriority, true);

const rybka = items.find((i) => i.title === 'Opowieść Złotej Rybki');
assert.ok(rybka, 'Spektakl "Opowieść Złotej Rybki" z grudnia musi być obecny');
assert.equal(rybka.eventDate, '2026-12-01');
assert.ok(rybka.description.includes('Scena Ateneum') && rybka.description.includes('ul. Św. Jana 10'), 'Grudniowe spektakle muszą zawierać adres ul. Św. Jana 10');

const mikolaj = items.find((i) => i.title.includes('spektakl z Mikołajem'));
assert.ok(mikolaj, 'Encje HTML w tytule z Mikołajem muszą być zdekodowane');
assert.equal(mikolaj.eventDate, '2026-12-06');

assert.equal(getVenueGroup({ sourceUrl: panTom.link, location: 'Teatr Ateneum', sourceName: 'Teatr Ateneum' }), 'other');
console.log('✅ Fixture Teatr Ateneum (JSON-LD + tooltipy): grupowanie powtórek, godziny, adresy scen, dla-dzieci i odrzucanie przeszłych.');

// 3. Fallback HTML bez JSON-LD (karty article lub carousel strony głównej)
const htmlOnlyFixture = fixtureHtml.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
const htmlFallbackItems = parseTeatrAteneum(htmlOnlyFixture, 'https://ateneumteatr.pl/events/', { now });
assert.ok(htmlFallbackItems.length >= 2, `Fallback bez JSON-LD powinien rozpoznać karty HTML, otrzymano ${htmlFallbackItems.length}`);
console.log(`✅ Fallback HTML bez JSON-LD rozpoznał ${htmlFallbackItems.length} zgrupowane spektakle.`);

// 4. Test na żywo processSource([15] Teatr Ateneum)
const ateneumSource = loadActiveSources().find((s) => s.id === '15');
assert.ok(ateneumSource, 'Źródło ID 15 musi być aktywne');
const liveItems = await processSource(ateneumSource);
assert.ok(Array.isArray(liveItems) && liveItems.length >= 1, 'Na żywo oczekiwano >= 1 pozycji z Teatru Ateneum');
console.log(`✅ Live processSource([15] Teatr Ateneum): pobrano ${liveItems.length} pozycji.`);

console.log('\n🎉 Wszystkie testy Teatru Ateneum zakończone sukcesem!\n');
