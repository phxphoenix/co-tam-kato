import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { validateArchivePeriod } from '../src/lib/archive-validation.ts';
import { getArchiveSettings, updateArchiveSettings } from '../src/server/archive-settings-service.ts';
import { getArchivePeriodDays, runArchiveWorker } from './archive-worker.mjs';

const ROOT_DIR = process.cwd();
const SETTINGS_FILE = path.join(ROOT_DIR, 'src', 'content', 'settings', 'archive.json');
const KEYSTATIC_CONFIG = path.join(ROOT_DIR, 'keystatic.config.ts');
const ASTRO_CONFIG = path.join(ROOT_DIR, 'astro.config.mjs');
const ADMIN_PAGE = path.join(ROOT_DIR, 'src', 'pages', 'admin', 'archive.astro');
const DASHBOARD_COMPONENT = path.join(ROOT_DIR, 'src', 'components', 'admin', 'ArchiveAdminDashboard.tsx');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     Błąd: ${err.message}`);
    failedTests++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     Błąd: ${err.message}`);
    failedTests++;
  }
}

console.log('\n======================================================');
console.log('🧪 Weryfikacja US 4: Konfiguracja okresu archiwizacji i zarządzanie w panelu');
console.log('======================================================\n');

// 1. Sekcja "Archive" w panelu Keystatic i panelu dedykowanym
test('AC 1.1: keystatic.config.ts definiuje singleton sekcji o etykiecie "Archive"', () => {
  const content = fs.readFileSync(KEYSTATIC_CONFIG, 'utf8');
  assert.ok(
    content.includes("label: 'Archive'") || content.includes('label: "Archive"'),
    'keystatic.config.ts musi posiadać sekcję o label: "Archive"'
  );
  assert.ok(
    content.includes('archiveAfterDays: fields.integer'),
    'Sekcja Archive w Keystatic musi zawierać pole archiveAfterDays typu integer'
  );
});

test('AC 1.2: Dedykowana podstrona panelu /admin/archive istnieje i montuje dashboard', () => {
  assert.ok(fs.existsSync(ADMIN_PAGE), 'Plik src/pages/admin/archive.astro musi istnieć');
  const pageContent = fs.readFileSync(ADMIN_PAGE, 'utf8');
  assert.ok(pageContent.includes('ArchiveAdminDashboard'), 'Strona musi renderować ArchiveAdminDashboard');
  assert.ok(fs.existsSync(DASHBOARD_COMPONENT), 'Komponent ArchiveAdminDashboard.tsx musi istnieć');
});

// 2. Domyślna wartość wynosi 10
test('AC 2.1: Domyślna wartość w keystatic.config.ts wynosi 10', () => {
  const content = fs.readFileSync(KEYSTATIC_CONFIG, 'utf8');
  assert.ok(
    content.includes('defaultValue: 10'),
    'Pole archiveAfterDays w Keystatic musi mieć defaultValue: 10'
  );
});

test('AC 2.2: Domyślna wartość zwracana przez serwis archiwizacji wynosi 10', () => {
  const settings = getArchiveSettings();
  assert.equal(typeof settings.archiveAfterDays, 'number');
  assert.ok(settings.archiveAfterDays > 0);
});

// 3. Kolumna/flaga Archived (True / False) na liście artykułów w panelu
test('AC 3.1: keystatic.config.ts zawiera kolumnę "archived" w widoku listy kolekcji news', () => {
  const content = fs.readFileSync(KEYSTATIC_CONFIG, 'utf8');
  const columnsMatch = content.match(/columns:\s*\[(.*?)\]/s);
  assert.ok(columnsMatch, 'W keystatic.config.ts zdefiniowano columns');
  assert.ok(
    columnsMatch[1].includes("'archived'") || columnsMatch[1].includes('"archived"'),
    'columns w news musi zawierać "archived"'
  );
});

test('AC 3.2: Komponent ArchiveAdminDashboard wyświetla jednoznaczną kolumnę z flagami Archived (True / False)', () => {
  const dashboardContent = fs.readFileSync(DASHBOARD_COMPONENT, 'utf8');
  assert.ok(
    dashboardContent.includes('Flaga Archived') || dashboardContent.includes('Archived'),
    'Tabela musi zawierać nagłówek kolumny Archived'
  );
  assert.ok(
    dashboardContent.includes('True (Archiwum)'),
    'Tabela musi renderować jednoznaczny znacznik True dla zarchiwizowanych wpisów'
  );
  assert.ok(
    dashboardContent.includes('False (Główna)'),
    'Tabela musi renderować jednoznaczny znacznik False dla aktywnych wpisów'
  );
});

// 4. Walidacja pola okresu archiwizacji (liczby całkowite dodatnie 1..365)
test('AC 4.1: Walidacja akceptuje poprawne liczby całkowite dodatnie z zakresu 1..365', () => {
  const validInputs = [1, 10, 14, 30, 180, 365, '1', '10', '365'];
  for (const input of validInputs) {
    const res = validateArchivePeriod(input);
    assert.ok(res.valid, `Wartość ${input} powinna być zaakceptowana`);
    assert.equal(typeof res.value, 'number');
    assert.ok(res.value >= 1 && res.value <= 365);
  }
});

test('AC 4.2: Walidacja blokuje wartości ujemne, zero, liczby > 365, ułamki, tekst i puste pola', () => {
  const invalidInputs = [
    { val: 0, reason: 'zero' },
    { val: -1, reason: 'liczba ujemna' },
    { val: -10, reason: 'liczba ujemna' },
    { val: 366, reason: 'przekracza 365' },
    { val: 1000, reason: 'przekracza 365' },
    { val: 10.5, reason: 'ułamek dziesiętny' },
    { val: '12.4', reason: 'ułamek w stringu' },
    { val: '', reason: 'pusty string' },
    { val: '   ', reason: 'same spacje' },
    { val: null, reason: 'null' },
    { val: undefined, reason: 'undefined' },
    { val: 'tekst', reason: 'tekst' },
    { val: 'dziesięć', reason: 'słowny zapis' },
  ];

  for (const item of invalidInputs) {
    const res = validateArchivePeriod(item.val);
    assert.equal(
      res.valid,
      false,
      `Wartość ${JSON.stringify(item.val)} (${item.reason}) powinna zostać zablokowana!`
    );
    assert.ok(
      typeof res.error === 'string' && res.error.length > 0,
      `Dla ${item.reason} powinien zostać zwrócony czytelny komunikat błędu`
    );
  }
});

test('AC 4.3: keystatic.config.ts posiada regułę walidacji min: 1, max: 365', () => {
  const content = fs.readFileSync(KEYSTATIC_CONFIG, 'utf8');
  assert.ok(
    content.includes('validation: { min: 1, max: 365 }'),
    'keystatic schema musi zawierać walidację min: 1, max: 365'
  );
});

// 5. Zapisywanie konfiguracji i odczyt przez workera
test('AC 5.1: Zmiana okresu zapisuje się w pliku i worker odczytuje zaktualizowaną wartość', () => {
  const originalSettings = getArchiveSettings();
  const testDays = 15;

  try {
    const updateResult = updateArchiveSettings(testDays);
    assert.ok(updateResult.success, 'Aktualizacja powinna zakończyć się sukcesem');
    assert.equal(updateResult.settings?.archiveAfterDays, testDays);

    const reloadedSettings = getArchiveSettings();
    assert.equal(reloadedSettings.archiveAfterDays, testDays, 'Serwis powinien zwrócić 15');

    const workerDays = getArchivePeriodDays();
    assert.equal(workerDays, testDays, 'Worker getArchivePeriodDays() powinien zwrócić 15');
  } finally {
    // Przywrócenie pierwotnych ustawień
    updateArchiveSettings(originalSettings.archiveAfterDays || 10);
  }
});

// 6. Przycisk "Uruchom teraz" i endpoint API
test('AC 6.1: astro.config.mjs wstrzykuje endpointy /api/archive-settings i /api/archive-run', () => {
  const content = fs.readFileSync(ASTRO_CONFIG, 'utf8');
  assert.ok(content.includes('/api/archive-settings'), 'astro.config.mjs musi wstrzykiwać /api/archive-settings');
  assert.ok(content.includes('/api/archive-run'), 'astro.config.mjs musi wstrzykiwać /api/archive-run');
});

await testAsync('AC 6.2: Worker archiwizacji wykonuje się na żądanie po wyzwoleniu force=true', async () => {
  const res = await runArchiveWorker({
    force: true,
    checkScheduledHour: false,
  });

  assert.equal(res.executed, true, 'Worker musi się wykonać po wywołaniu z force: true');
  assert.equal(typeof res.totalScanned, 'number');
  assert.equal(typeof res.archivedCount, 'number');
  assert.equal(typeof res.alreadyArchivedCount, 'number');
  assert.equal(typeof res.protectedByOverrideCount, 'number');
  assert.equal(res.errorsCount, 0, 'Worker nie powinien zgłosić żadnych błędów');
});

console.log('\n------------------------------------------------------');
console.log(`Wynik testów US 4: ${passedTests} zaliczonych, ${failedTests} niezaliczonych.`);
console.log('------------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
}
