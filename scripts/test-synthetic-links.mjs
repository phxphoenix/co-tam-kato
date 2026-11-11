import assert from 'node:assert/strict';
import {
  buildItemsFromDiscoveredLinks,
  selectPromptItems,
  processSource,
} from './daily-digest.mjs';
import { loadActiveSources } from './sources-parser.mjs';

console.log('\n======================================================');
console.log('🧪 Weryfikacja pozycji z discoveredLinks dla źródeł ogólnych (max 5) i fallbacku');
console.log('======================================================\n');

const sampleSource = {
  id: '99',
  name: 'Przykładowy Portal Katowice',
  type: 'WEB',
  url: 'https://example.pl/wydarzenia/',
  category: 'Kultura',
  hints: 'Test',
};

// 1. Odfiltrowuje linki nawigacyjne, polityki, koszyki, generyczne CTA i ogranicza do maks. 5 pozycji
const mixedEntries = [
  { url: 'https://example.pl/polityka-prywatnosci/', label: 'Polityka prywatności' },
  { url: 'https://example.pl/koszyk/', label: '0 0,00 PLN Ważność: 15:00' },
  { url: 'https://example.pl/wydarzenia/koncert-1', label: 'Czytaj więcej' },
  { url: 'https://example.pl/wydarzenia/koncert-1', label: 'Koncert Jazzowy w Strefie Kultury 14 listopada 2026' },
  { url: 'https://example.pl/wydarzenia/wystawa-2', label: 'Wystawa designu w Katowicach – otwarcie' },
  { url: 'https://example.pl/wydarzenia/festiwal-3', label: 'Festiwal Filmów Dokumentalnych w Rialto' },
  { url: 'https://example.pl/wydarzenia/warsztaty-4', label: 'Rodzinne warsztaty ceramiczne dla dzieci' },
  { url: 'https://example.pl/wydarzenia/spotkanie-5', label: 'Spotkanie autorskie w Mieście Ogrodów' },
  { url: 'https://example.pl/wydarzenia/koncert-6', label: 'Szósty koncert poza limitem 5 pozycji' },
];

const built = buildItemsFromDiscoveredLinks(
  mixedEntries,
  sampleSource,
  'katowice',
  'Zapraszamy na Koncert Jazzowy w Strefie Kultury 14 listopada 2026 https://example.pl/wydarzenia/koncert-1 od godz. 19:00.',
  5
);

assert.equal(built.length, 5, `Oczekiwano maks. 5 pozycji z discoveredLinks, otrzymano ${built.length}`);
assert.equal(built[0].title, 'Koncert Jazzowy w Strefie Kultury 14 listopada 2026');
assert.equal(built[0].eventDate, '2026-11-14');
assert.equal(built[0].isSyntheticContainer, undefined);
assert.equal(built.some((i) => i.title.includes('Polityka') || i.title.includes('Ważność') || i.title === 'Czytaj więcej'), false);
assert.equal(built.some((i) => i.title.includes('Szósty koncert')), false, 'Limit 5 pozycji na źródło musi być egzekwowany');
console.log('✅ buildItemsFromDiscoveredLinks poprawnie filtruje śmieci, wyciąga tytuły kotwic i limituje do 5 pozycji.');

// 2. Fallback: gdy brak wartościowych linków, zwraca pustą tablicę (co uruchamia isSyntheticContainer)
const boilerplateOnly = [
  { url: 'https://example.pl/polityka-prywatnosci/', label: 'Polityka prywatności' },
  { url: 'https://example.pl/wydarzenia/', label: 'Wydarzenia' },
  { url: 'https://example.pl/info', label: 'Czytaj więcej' },
];
assert.deepEqual(buildItemsFromDiscoveredLinks(boilerplateOnly, sampleSource, 'katowice'), []);
console.log('✅ Fallback przy braku opisowych linków zwraca [] (zachowując blok kontenera syntetycznego).');

// 3. Weryfikacja selectPromptItems dla wygenerowanych pozycji
const selected = selectPromptItems(built, []);
assert.equal(selected.length, 5);
console.log('✅ Pozycje z discoveredLinks przechodzą czysto przez selectPromptItems.');

// 4. Szybki test na żywo dla źródeł ogólnych (1 PIK Główne i 17 Planetarium fallback)
const activeSources = loadActiveSources();
for (const id of ['1', '17']) {
  const src = activeSources.find((s) => s.id === id);
  const res = await processSource(src);
  const visible = res.filter((it) => !it.isDiscoveredLinkOnly);
  assert.ok(visible.length >= 1 && visible.length <= 5, `[${id}] ${src.name}: oczekiwano 1..5 widocznych pozycji, otrzymano ${visible.length}`);
  if (id === '17') {
    assert.equal(visible[0].isSyntheticContainer, true, 'Planetarium bez linków wydarzeń musi użyć fallbacku kontenera');
  } else {
    assert.equal(visible[0].isSyntheticContainer, undefined, 'PIK Główne musi zwrócić konkretne pozycje z discoveredLinks');
  }
  console.log(`✅ Live [${id}] ${src.name}: ${visible.length} widocznych pozycji (tryb: ${visible[0].isSyntheticContainer ? 'fallback kontener' : 'discoveredLinks'}).`);
}

console.log('\n🎉 Wszystkie testy pozycji z discoveredLinks i fallbacku zakończone sukcesem!\n');
