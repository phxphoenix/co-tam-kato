import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
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

// 5. Weryfikacja wczesnej bramki schedule_check w .github/workflows/daily-digest.yml
const workflowContent = fs.readFileSync(path.resolve('.github/workflows/daily-digest.yml'), 'utf8');
assert.match(
  workflowContent,
  /id:\s*schedule_check/,
  'Workflow daily-digest.yml musi posiadać wczesny krok o id: schedule_check'
);
assert.match(
  workflowContent,
  /--check-schedule/,
  'Krok schedule_check musi wywoływać daily-digest.mjs z flagą --check-schedule przed instalacją zależności'
);

const stepCheckIndex = workflowContent.indexOf('id: schedule_check');
const stepSetupNodeIndex = workflowContent.indexOf('uses: actions/setup-node@v4');
const stepNpmCiIndex = workflowContent.indexOf('run: npm ci');
assert.ok(
  stepCheckIndex > 0 && stepCheckIndex < stepSetupNodeIndex && stepCheckIndex < stepNpmCiIndex,
  'Krok schedule_check musi znajdować się PRZED actions/setup-node oraz npm ci'
);

const guardedSteps = workflowContent.match(/if:\s*steps\.schedule_check\.outputs\.should_run\s*==\s*'true'/g) || [];
assert.equal(
  guardedSteps.length,
  5,
  'Wszystkie 5 ciężkich kroków (setup-node, npm ci, digest, build, commit/push) musi być chronionych warunkiem should_run == true'
);

// 6. Test integracyjny flagi --check-schedule oraz zapisu do GITHUB_OUTPUT
const tmpOutFile = path.join(os.tmpdir(), `kato-gh-output-${Date.now()}.txt`);
try {
  const activeCron = currentOffset === 1 ? '0 0,6,12,18 * * *' : '0 5,11,17,23 * * *';
  const inactiveCron = currentOffset === 1 ? '0 5,11,17,23 * * *' : '0 0,6,12,18 * * *';

  fs.writeFileSync(tmpOutFile, '', 'utf8');
  execFileSync(
    process.execPath,
    ['scripts/daily-digest.mjs', '--check-schedule', '--scheduled', `--cron=${activeCron}`],
    { env: { ...process.env, GITHUB_OUTPUT: tmpOutFile } }
  );
  assert.equal(
    fs.readFileSync(tmpOutFile, 'utf8').trim(),
    'should_run=true',
    'Dla aktywnego crona --check-schedule musi zapisać should_run=true do GITHUB_OUTPUT'
  );

  fs.writeFileSync(tmpOutFile, '', 'utf8');
  execFileSync(
    process.execPath,
    ['scripts/daily-digest.mjs', '--check-schedule', '--scheduled', `--cron=${inactiveCron}`],
    { env: { ...process.env, GITHUB_OUTPUT: tmpOutFile } }
  );
  assert.equal(
    fs.readFileSync(tmpOutFile, 'utf8').trim(),
    'should_run=false',
    'Dla nieaktywnego crona --check-schedule musi zapisać should_run=false do GITHUB_OUTPUT'
  );
} finally {
  if (fs.existsSync(tmpOutFile)) fs.unlinkSync(tmpOutFile);
}

console.log('✓ Wczesna bramka schedule_check (GITHUB_OUTPUT + pomijanie npm ci / build) zweryfikowana.');
console.log('🎉 Wszystkie testy logiki harmonogramu zakończone sukcesem (PASS)!');
