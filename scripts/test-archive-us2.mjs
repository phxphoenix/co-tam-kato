import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { updateArticleArchive } from '../src/server/archive-service.ts';
import { AUTO_ARCHIVE_DAYS } from '../src/lib/constants.ts';
import { toggleItemArchive, isItemArchived, setItemArchiveState, getStoredArchiveOverrides } from '../src/lib/archive.ts';

console.log('🧪 Rozpoczynam automatyczną weryfikację kryteriów akceptacji US 2...');

const ROOT_DIR = process.cwd();
const NEWS_DIR = path.join(ROOT_DIR, 'src', 'content', 'news');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Test 1: Sprawdzenie obecności dedykowanego przycisku z ikoną „A” obok ikony serduszka (AC 1)
console.log('\n--- AC 1: Dedykowany przycisk na kafelku z ikoną zawierającą literę „A” ---');
const interactiveFeedSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'InteractiveFeed.tsx'), 'utf8');
const archiveButtonSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'ArchiveButton.tsx'), 'utf8');

assert.ok(
  interactiveFeedSrc.includes('<ArchiveButton'),
  'InteractiveFeed musi renderować ArchiveButton na kafelkach'
);

assert.ok(
  archiveButtonSrc.includes('ArchiveAIcon'),
  'ArchiveButton musi korzystać z ikony ArchiveAIcon'
);

assert.ok(
  archiveButtonSrc.includes('strokeWidth="2.2"') && archiveButtonSrc.includes('d="M9.2 16.5l2.8 -6.5l2.8 6.5"'),
  'ArchiveAIcon musi rysować stylizowaną literę „A” wewnątrz pudełka archiwizacyjnego'
);

// Sprawdźmy, czy ArchiveButton znajduje się w sąsiedztwie przycisku serduszka (FavoriteButton / toggleFavorite)
const buttonGroupingMatch = interactiveFeedSrc.match(/<ArchiveButton[\s\S]*?<button[\s\S]*?toggleFavorite/);
assert.ok(
  buttonGroupingMatch,
  'ArchiveButton musi znajdować się bezpośrednio obok przycisku ulubionych (serduszka)'
);

console.log('✅ AC 1 spełnione: Dedykowany przycisk z estetyczną ikoną „A” znajduje się bezpośrednio obok serduszka.');

// Test 2 & 3: Aktualizacja pliku w bazie / Markdown i odwracalność akcji (AC 2 & AC 3)
console.log('\n--- AC 2 & AC 3: Manualna archiwizacja w pliku, aktualizacja stanu i odwracalność ---');

const testSlug = '2026-09-10-test-us2-reczna-archiwizacja';
const testFilePath = path.join(NEWS_DIR, `${testSlug}.md`);

const initialTestContent = `---
title: "Testowy Artykuł do Manualnej Archiwizacji US2"
pubDate: 2026-09-10
sourceDate: 2026-09-10
city: "katowice"
category: "wydarzenia"
status: "published"
archived: false
manualOverride: false
summary: "Krótka zajawka testowa dla manualnej archiwizacji."
isAlert: false
aiGenerated: false
---

Treść testowa artykułu.
`;

fs.writeFileSync(testFilePath, initialTestContent, 'utf8');
console.log(`Utworzono plik testowy: ${testSlug}.md z archived: false`);

try {
  // Krok 1: Archiwizacja (Archived = true)
  const archiveResult = updateArticleArchive(testSlug, true, false);
  assert.ok(archiveResult.success, 'updateArticleArchive powinno zakończyć się sukcesem');

  const afterArchiveContent = fs.readFileSync(testFilePath, 'utf8');
  assert.ok(
    afterArchiveContent.includes('archived: true'),
    'Plik po archiwizacji MUSI mieć archived: true w frontmatterze'
  );
  console.log('✅ AC 2 spełnione: Kliknięcie/wywołanie archiwizacji zmienia flagę w pliku na Archived = True.');

  // Krok 2: Odwrócenie akcji (Unarchive - Archived = false)
  const unarchiveResult = updateArticleArchive(testSlug, false, false);
  assert.ok(unarchiveResult.success, 'updateArticleArchive (przywrócenie) powinno zakończyć się sukcesem');

  const afterUnarchiveContent = fs.readFileSync(testFilePath, 'utf8');
  assert.ok(
    afterUnarchiveContent.includes('archived: false'),
    'Plik po przywróceniu MUSI mieć archived: false w frontmatterze'
  );
  console.log('✅ AC 3 spełnione: Odwrócenie akcji pozwala na przywrócenie artykułu (Archived = False).');

  // Test 4: Ochrona przed ponowną auto-archiwizacją (Manual Override - AC 4)
  console.log('\n--- AC 4: Ochrona przed ponowną auto-archiwizacją (Manual Override) ---');
  
  // Weryfikacja stałej AUTO_ARCHIVE_DAYS
  assert.ok(
    typeof AUTO_ARCHIVE_DAYS === 'number' && AUTO_ARCHIVE_DAYS > 0,
    'AUTO_ARCHIVE_DAYS musi być zdefiniowaną liczbą dni'
  );
  console.log(`Konfiguracja auto-archiwizacji: AUTO_ARCHIVE_DAYS = ${AUTO_ARCHIVE_DAYS} dni`);

  // Artykuł z datą 2026-09-10 (ponad miesiąc temu, czyli znacznie starszy niż AUTO_ARCHIVE_DAYS)
  // Przywrócenie takiego artykułu musi nadać mu flagę manualOverride: true
  const overrideResult = updateArticleArchive(testSlug, false, true);
  assert.ok(overrideResult.success, 'Aktualizacja z manualOverride powiodła się');

  const afterOverrideContent = fs.readFileSync(testFilePath, 'utf8');
  assert.ok(
    afterOverrideContent.includes('manualOverride: true'),
    'Artykuł starszy niż skonfigurowana liczba dni musi otrzymać flagę manualOverride: true'
  );

  // Weryfikacja logiki w bibliotece toggleItemArchive
  // Symulacja środowiska przeglądarki z localStorage
  const mockStorage = new Map();
  global.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, val),
    removeItem: (key) => mockStorage.delete(key),
  };
  global.window = {
    dispatchEvent: () => {},
  };

  // Najpierw ustawmy stan jako zarchiwizowany
  setItemArchiveState(testSlug, { archived: true, manualOverride: false });
  assert.ok(isItemArchived(testSlug, false) === true, 'Stan testowy: zarchiwizowany');

  // Wywołajmy toggleItemArchive (przywrócenie) dla artykułu starszego niż AUTO_ARCHIVE_DAYS (data 2026-09-10)
  const toggledState = toggleItemArchive({
    slug: testSlug,
    pubDate: '2026-09-10T00:00:00.000Z',
    defaultArchived: true,
  });

  assert.equal(toggledState.archived, false, 'Artykuł musi zostać odarchiwizowany (archived: false)');
  assert.equal(toggledState.manualOverride, true, 'Artykuł starszy niż limit dni MUSI otrzymać manualOverride: true');

  console.log('✅ AC 4 spełnione: Przywrócenie starszego artykułu nadaje flagę manualOverride = true.');

  // Test 5: Feedback w UI (AC 5)
  console.log('\n--- AC 5: Feedback w UI (Toast / Snackbar z przyciskiem Cofnij i Tooltipy) ---');

  // Weryfikacja tooltipów w ArchiveButton.tsx
  assert.ok(
    archiveButtonSrc.includes("'Przywróć z archiwum' : 'Archiwizuj'"),
    'ArchiveButton musi posiadać tooltip „Archiwizuj” / „Przywróć z archiwum”'
  );

  // Weryfikacja Toastu z przyciskiem Cofnij w InteractiveFeed.tsx
  assert.ok(
    interactiveFeedSrc.includes('role="status"'),
    'InteractiveFeed musi renderować element toastu dostępny dla czytników ekranu (role="status")'
  );
  assert.ok(
    interactiveFeedSrc.includes('Cofnij'),
    'Toast musi zawierać przycisk „Cofnij”'
  );
  assert.ok(
    interactiveFeedSrc.includes('handleUndoToast'),
    'Przycisk Cofnij musi obsługiwać cofanie stanu (handleUndoToast)'
  );

  console.log('✅ AC 5 spełnione: Toast feedback z przyciskiem Cofnij oraz podpowiedzi (tooltipy) zaimplementowane.');

} finally {
  // Posprzątajmy plik testowy
  if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
    console.log(`\nUsunięto plik testowy: ${testSlug}.md`);
  }
}

// Przebudowanie na czysto
execSync('cmd /c npm run build', { stdio: 'pipe' });
console.log('\n🎉 Wszystkie testy akceptacyjne US 2 zakończone sukcesem (100% PASS)!');
