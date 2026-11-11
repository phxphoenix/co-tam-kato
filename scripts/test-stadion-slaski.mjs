import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  parseStadionSlaski,
  processSource,
  fetchWithTlsAia,
  getVenueGroup,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja parsera Stadion Śląski i diagnostyki TLS/AIA');
console.log('======================================================\n');

const now = new Date('2026-11-11T12:00:00Z');

// 1. Fixture /wiadomosci
const wiadHtml = fs.readFileSync(path.resolve('scripts/fixtures/stadion-slaski.html'), 'utf8');
const wiadItems = parseStadionSlaski(wiadHtml, 'https://superautostadionslaski.pl/wiadomosci', { now });

assert.equal(wiadItems.length, 2, `Oczekiwano 2 aktualne/przyszłe pozycje z fixture /wiadomosci, otrzymano ${wiadItems.length}`);
assert.equal(
  wiadItems.some((item) => item.title.includes('Złote Kolce 2026 rozdane')),
  false,
  'Przeterminowana relacja z 26.10 (>14 dni bez przyszłego eventDate) musi zostać odrzucona'
);

const closureItem = wiadItems.find((item) => item.title.includes('Zwiedzanie Stadionu niedostępne'));
assert.ok(closureItem, 'Świeża wiadomość z 30.10 musi pozostać');
assert.equal(closureItem.pubDate, '2026-10-30');
assert.equal(closureItem.eventDate, null);
assert.equal(closureItem.defaultCity, 'chorzow');

const bocelliNews = wiadItems.find((item) => item.title.includes('Andrei Bocellego'));
assert.ok(bocelliNews, 'Zapowiedź przyszłego koncertu w 2027 r. musi zostać zachowana');
assert.equal(bocelliNews.eventDate, '2027-05-30');
assert.equal(bocelliNews.pubDate, '2026-09-28');
console.log('✅ Fixture /wiadomosci: poprawnie rozróżnia pubDate od przyszłego eventDate i odrzuca stare relacje.');

// 2. Fixture /wydarzenia + odrzucanie przeszłych wydarzeń
const wydHtml = fs.readFileSync(path.resolve('scripts/fixtures/stadion-slaski-wydarzenia.html'), 'utf8');
const pastInjectedHtml = wydHtml + `
<div class="popular-events">
  <div class="popular-events-content">
    <a class="popular-event-title" href="https://superautostadionslaski.pl/wydarzenie/miniony-mecz">Miniony Mecz Testowy</a>
    <p class="popular-event-desc">Testowe wydarzenie z przeszłości.</p>
    <span class="popular-event-date">05 listopada 2026 | 19:00</span>
  </div>
</div>`;

const wydItems = parseStadionSlaski(pastInjectedHtml, 'https://superautostadionslaski.pl/wydarzenia', { now });
assert.equal(wydItems.length, 2, `Oczekiwano 2 nadchodzące wydarzenia (przeszłe odrzucone), otrzymano ${wydItems.length}`);
assert.equal(wydItems[0].title, 'Aktywny Śląski');
assert.equal(wydItems[0].eventDate, '2026-11-12');
assert.ok(wydItems[0].description.includes('18:00'), 'Opis musi zawierać godzinę wydarzenia');
assert.equal(wydItems[1].eventDate, '2027-05-30');
assert.equal(wydItems.some((item) => item.title.includes('Miniony Mecz')), false, 'Przeszłe wydarzenie musi być odrzucone');
console.log('✅ Fixture /wydarzenia: ekstrahuje eventDate, godzinę oraz odrzuca wydarzenia przeszłe.');

// 3. Sprawdzenie, że Stadion Śląski nie jest w grupie biletowanej (venueGroup === 'other') i brak highPriority
for (const item of [...wiadItems, ...wydItems]) {
  assert.equal(getVenueGroup({ sourceUrl: item.link, location: 'Stadion Śląski', sourceName: 'Stadion Śląski' }), 'other');
  assert.notEqual(item.highPriority, true, 'Stadion Śląski nie może mieć flagi highPriority');
}
console.log('✅ Pozycje Stadion Śląski należą do venueGroup "other" i nie dostają highPriority.');

// 4. Test odrzucania nieznanego / niepodpisanego certyfikatu w fetchWithTlsAia
await assert.rejects(
  () => fetchWithTlsAia('https://self-signed.badssl.com/', { signal: AbortSignal.timeout(5000) }).catch((err) => {
    throw err;
  }),
  (err) => Boolean(err),
  'Nieprawidłowy lub nieosiągalny certyfikat nie może zostać zaakceptowany'
);

// 5. Weryfikacja na żywo źródła ID 21 (processSource)
const stadionSource = loadActiveSources().find((s) => s.id === '21');
assert.ok(stadionSource, 'Źródło ID 21 (Stadion Śląski) musi być aktywne w config/sources.md');
const liveItems = await processSource(stadionSource);
assert.ok(Array.isArray(liveItems) && liveItems.length >= 1, `Oczekiwano >= 1 pozycji na żywo dla Stadionu Śląskiego, otrzymano ${liveItems.length}`);
for (const item of liveItems) {
  assert.ok(item.link.startsWith('https://superautostadionslaski.pl/'), `Nieprawidłowy link: ${item.link}`);
  assert.notEqual(item.highPriority, true);
}
console.log(`✅ Live processSource([21] Stadion Śląski): pobrano ${liveItems.length} pozycji.`);

console.log('\n🎉 Wszystkie testy Stadionu Śląskiego zakończone sukcesem!\n');
