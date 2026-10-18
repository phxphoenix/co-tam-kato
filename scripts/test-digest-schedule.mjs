import assert from 'node:assert/strict';
import { getWarsawOffsetHours, shouldRunForSchedule } from './daily-digest.mjs';

console.log('🧪 Rozpoczynam testy logiki harmonogramu Agenta AI (Co Tam KATO)...');

// 1. Sprawdzenie bieżącego przesunięcia strefy czasowej
const now = new Date();
const currentOffset = getWarsawOffsetHours(now);
console.log(`✓ Bieżące przesunięcie dla Europe/Warsaw: UTC+${currentOffset}`);
assert.ok(currentOffset === 1 || currentOffset === 2, 'Offset musi wynosić 1 (CET) lub 2 (CEST)');

// 2. Test dla lata (CEST, UTC+2, np. 15 lipca)
const summerDate = new Date('2026-07-15T12:00:00Z');
const summerOffset = getWarsawOffsetHours(summerDate);
assert.equal(summerOffset, 2, 'W lipcu strefa Europe/Warsaw musi mieć offset UTC+2 (CEST)');

// Harmonogram letni powinien zostać zaakceptowany
assert.equal(
  shouldRunForSchedule('0 5,11,17,23 * * *', summerDate),
  true,
  'Harmonogram letni (0 5,11,17,23 * * *) musi być aktywny latem'
);

// Harmonogram zimowy powinien zostać zignorowany latem
assert.equal(
  shouldRunForSchedule('0 0,6,12,18 * * *', summerDate),
  false,
  'Harmonogram zimowy (0 0,6,12,18 * * *) musi zostać pominięty latem'
);

// 3. Test dla zimy (CET, UTC+1, np. 15 stycznia)
const winterDate = new Date('2026-01-15T12:00:00Z');
const winterOffset = getWarsawOffsetHours(winterDate);
assert.equal(winterOffset, 1, 'W styczniu strefa Europe/Warsaw musi mieć offset UTC+1 (CET)');

// Harmonogram zimowy powinien zostać zaakceptowany zimą
assert.equal(
  shouldRunForSchedule('0 0,6,12,18 * * *', winterDate),
  true,
  'Harmonogram zimowy (0 0,6,12,18 * * *) musi być aktywny zimą'
);

// Harmonogram letni powinien zostać zignorowany zimą
assert.equal(
  shouldRunForSchedule('0 5,11,17,23 * * *', winterDate),
  false,
  'Harmonogram letni (0 5,11,17,23 * * *) musi zostać pominięty zimą'
);

// 4. Test dla braku cronArg (np. uruchomienie ręczne przez workflow_dispatch lub CLI)
assert.equal(shouldRunForSchedule(null, summerDate), true, 'Brak crona (manual) musi się wykonać');
assert.equal(shouldRunForSchedule(undefined, winterDate), true, 'Brak crona (manual) musi się wykonać');
assert.equal(shouldRunForSchedule('', summerDate), true, 'Pusty ciąg cron (manual) musi się wykonać');

console.log('🎉 Wszystkie testy logiki harmonogramu zakończone sukcesem (PASS)!');
