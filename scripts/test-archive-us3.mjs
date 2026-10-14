import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  runArchiveWorker,
  getArchivePeriodDays,
  getWarsawTime,
} from './archive-worker.mjs';

console.log('🧪 Rozpoczynam automatyczną weryfikację kryteriów akceptacji US 3...');

const ROOT_DIR = process.cwd();
const NEWS_DIR = path.join(ROOT_DIR, 'src', 'content', 'news');
const SETTINGS_PATH = path.join(ROOT_DIR, 'src', 'content', 'settings', 'archive.json');
const LOG_FILE = path.join(ROOT_DIR, 'logs', 'archive-worker.log');
const WORKFLOW_FILE = path.join(ROOT_DIR, '.github', 'workflows', 'archive-worker.yml');

// --- AC 1: Model danych z polem Archived ---
console.log('\n--- AC 1: Model danych z polem Archived (domyślnie false) ---');
const contentConfigSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content.config.ts'), 'utf8');
const keystaticConfigSrc = fs.readFileSync(path.join(ROOT_DIR, 'keystatic.config.ts'), 'utf8');

assert.ok(
  contentConfigSrc.includes('archived: z.boolean().default(false)'),
  'content.config.ts musi definiować archived jako boolean z default false'
);
assert.ok(
  keystaticConfigSrc.includes('archived: fields.checkbox'),
  'keystatic.config.ts musi posiadać pole archived'
);
console.log('✅ AC 1 spełnione: Model danych artykułu posiada pole Archived = false domyślnie.');

// --- AC 2 & Strefy czasowe: Harmonogram 02:00 czasu polskiego ---
console.log('\n--- AC 2: Harmonogram 02:00 w strefie Europe/Warsaw (CEST/CET) ---');
assert.ok(fs.existsSync(WORKFLOW_FILE), 'Plik workflow archive-worker.yml musi istnieć');
const workflowYaml = fs.readFileSync(WORKFLOW_FILE, 'utf8');

assert.ok(
  workflowYaml.includes("cron: '0 0 * * *'"),
  'Workflow musi zawierać wywołanie o 00:00 UTC (02:00 CEST w czasie letnim)'
);
assert.ok(
  workflowYaml.includes("cron: '0 1 * * *'"),
  'Workflow musi zawierać wywołanie o 01:00 UTC (02:00 CET w czasie zimowym)'
);

// Test funkcji getWarsawTime
const nowWarsaw = getWarsawTime();
assert.ok(nowWarsaw.year >= 2026, 'getWarsawTime zwraca poprawny rok');
assert.ok(nowWarsaw.hour >= 0 && nowWarsaw.hour <= 23, 'Godzina w zakresie 0-23');
console.log(`Bieżący czas w strefie Europe/Warsaw: ${nowWarsaw.isoDate} ${nowWarsaw.timeStr}`);

// Test sprawdzania godziny przez workera przy checkScheduledHour = true
const fakeDateAt15 = new Date('2026-10-14T13:00:00Z'); // 15:00 czasu polskiego
const skippedRun = await runArchiveWorker({
  force: false,
  checkScheduledHour: true,
  targetHour: 2,
  referenceDate: fakeDateAt15,
});

assert.equal(skippedRun.executed, false, 'Worker musi pominąć wykonanie poza godziną 02:00');
assert.equal(skippedRun.reason, 'outside_scheduled_hour');
console.log('✅ AC 2 spełnione: Harmonogram uwzględnia strefę Europe/Warsaw i uruchamia się o 02:00 czasu lokalnego.');

// --- AC 3: Pobieranie okresu archiwizacji z konfiguracji (domyślnie 10 dni) ---
console.log('\n--- AC 3: Pobieranie okresu archiwizacji z konfiguracji w panelu (domyślnie 10 dni) ---');
assert.ok(fs.existsSync(SETTINGS_PATH), 'Plik archive.json musi istnieć');
const initialDays = getArchivePeriodDays();
assert.equal(initialDays, 10, 'Domyślna wartość okresu archiwizacji w archive.json to 10 dni');

// Sprawdźmy singleton w keystatic.config.ts
assert.ok(
  keystaticConfigSrc.includes('archive: singleton') || keystaticConfigSrc.includes('archiveSettings: singleton'),
  'keystatic.config.ts musi definiować singleton sekcji Archive dla panelu'
);
assert.ok(
  keystaticConfigSrc.includes("defaultValue: 10"),
  'Formularz w panelu musi mieć domyślnie 10 dni'
);
console.log('✅ AC 3 spełnione: Worker poprawnie pobiera okres archiwizacji z konfiguracji panelu (10 dni).');

// --- AC 4 & 5: Filtrowanie artykułów (wiek > 10 dni, archived=false, ochrona manualOverride) ---
console.log('\n--- AC 4 & 5: Filtrowanie artykułów i przenoszenie do Archiwum ---');

const testOldSlug = '2026-09-20-test-us3-stary-artykul';
const testFreshSlug = '2026-10-12-test-us3-swiezy-artykul';
const testProtectedSlug = '2026-09-20-test-us3-chroniony-override';

const oldArticlePath = path.join(NEWS_DIR, `${testOldSlug}.md`);
const freshArticlePath = path.join(NEWS_DIR, `${testFreshSlug}.md`);
const protectedArticlePath = path.join(NEWS_DIR, `${testProtectedSlug}.md`);

// Dzisiejsza data referencyjna: 2026-10-14
const refDate = new Date('2026-10-14T02:00:00+02:00');

// 1. Stary artykuł (2026-09-20, ~24 dni temu > 10 dni) -> MUSI ZOSTAĆ ZARCHIWIZOWANY
fs.writeFileSync(
  oldArticlePath,
  `---
title: "Stary Artykuł Sprzed 24 Dni US3"
pubDate: 2026-09-20
sourceDate: 2026-09-20
city: "katowice"
category: "wydarzenia"
status: "published"
archived: false
manualOverride: false
summary: "Stary artykuł."
---

Treść.
`,
  'utf8'
);

// 2. Świeży artykuł (2026-10-12, 2 dni temu <= 10 dni) -> MUSI POZOSTAĆ NIEZARCHIWIZOWANY
fs.writeFileSync(
  freshArticlePath,
  `---
title: "Świeży Artykuł Sprzed 2 Dni US3"
pubDate: 2026-10-12
sourceDate: 2026-10-12
city: "katowice"
category: "wydarzenia"
status: "published"
archived: false
manualOverride: false
summary: "Świeży artykuł."
---

Treść.
`,
  'utf8'
);

// 3. Stary artykuł z ManualOverride = True (2026-09-20) -> OCHRONA Z US 2, MUSI POZOSTAĆ NIEZARCHIWIZOWANY!
fs.writeFileSync(
  protectedArticlePath,
  `---
title: "Artykuł Chroniony ManualOverride US3"
pubDate: 2026-09-20
sourceDate: 2026-09-20
city: "katowice"
category: "wydarzenia"
status: "published"
archived: false
manualOverride: true
summary: "Chroniony artykuł."
---

Treść.
`,
  'utf8'
);

try {
  // Uruchomienie workera dla daty referencyjnej 2026-10-14 z limitem 10 dni
  const workerResult = await runArchiveWorker({
    force: true,
    customDays: 10,
    referenceDate: refDate,
  });

  assert.ok(workerResult.executed, 'Worker powinien się wykonać');
  assert.ok(workerResult.archivedCount >= 1, 'Co najmniej 1 artykuł powinien zostać zarchiwizowany');
  assert.ok(workerResult.protectedByOverrideCount >= 1, 'Artykuł z ManualOverride powinien zostać ochroniony');

  // Weryfikacja 1: Stary artykuł otrzymał archived: true
  const oldContentAfter = fs.readFileSync(oldArticlePath, 'utf8');
  assert.ok(
    oldContentAfter.includes('archived: true'),
    'Stary artykuł (> 10 dni) MUSI otrzymać archived: true'
  );
  console.log('✅ Stary artykuł (> 10 dni): poprawnie przeniesiony do Archiwum (archived: true).');

  // Weryfikacja 2: Świeży artykuł pozostał archived: false
  const freshContentAfter = fs.readFileSync(freshArticlePath, 'utf8');
  assert.ok(
    freshContentAfter.includes('archived: false'),
    'Świeży artykuł (<= 10 dni) MUSI pozostać archived: false'
  );
  console.log('✅ Świeży artykuł (2 dni): pozostał na stronie głównej (archived: false).');

  // Weryfikacja 3: Chroniony artykuł pozostał archived: false dzięki ManualOverride = true
  const protectedContentAfter = fs.readFileSync(protectedArticlePath, 'utf8');
  assert.ok(
    protectedContentAfter.includes('archived: false'),
    'Artykuł z ManualOverride=true MUSI pozostać archived: false mimo wieku > 10 dni!'
  );
  console.log('✅ Artykuł z ManualOverride = True: bezpiecznie ochroniony przed auto-archiwizacją!');

  // --- AC 6: Idempotentność i logowanie ---
  console.log('\n--- AC 6: Logowanie i idempotentność operacji ---');

  // Ponowne uruchomienie workera w tym samym stanie
  const secondRun = await runArchiveWorker({
    force: true,
    customDays: 10,
    referenceDate: refDate,
  });

  assert.equal(
    secondRun.archivedCount,
    0,
    'Drugie uruchomienie workera nie może ponownie modyfikować już zarchiwizowanych artykułów (idempotentność)!'
  );
  console.log('✅ Idempotentność: powtórny przebieg workera zarchiwizował dokładnie 0 artykułów.');

  // Weryfikacja pliku logów
  assert.ok(fs.existsSync(LOG_FILE), 'Plik logu logs/archive-worker.log musi istnieć');
  const logContent = fs.readFileSync(LOG_FILE, 'utf8');
  assert.ok(logContent.includes('Zakończono proces'), 'Log zawiera podsumowanie wykonania');
  assert.ok(logContent.includes('Europe/Warsaw'), 'Log zawiera informację o strefie czasowej');
  console.log('✅ Logowanie: zapis do pliku dziennika logs/archive-worker.log zweryfikowany pomyślnie.');

} finally {
  // Sprzątanie plików testowych
  [oldArticlePath, freshArticlePath, protectedArticlePath].forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  console.log('\nUsunięto pliki testowe.');
}

console.log('\n🎉 Wszystkie kryteria akceptacji US 3 spełnione w 100% (PASS)!');
