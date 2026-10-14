import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT_DIR = process.cwd();

const testSuites = [
  { name: 'US 1: Widok i nawigacja sekcji Archiwum', script: 'scripts/test-archive-us1.mjs' },
  { name: 'US 2: Manualna archiwizacja i przywracanie z kafelka', script: 'scripts/test-archive-us2.mjs' },
  { name: 'US 3: Nocny worker automatycznej archiwizacji', script: 'scripts/test-archive-us3.mjs' },
  { name: 'US 4: Konfiguracja okresu archiwizacji i panel zarządzania', script: 'scripts/test-archive-us4.mjs' },
];

console.log('\n========================================================================');
console.log('🚀 Co Tam KATO: Pełny zestaw testów modułu archiwizacji (US 1 - US 4)');
console.log('========================================================================\n');

let totalPassed = 0;
let totalFailed = 0;

for (const suite of testSuites) {
  console.log(`\n▶ Uruchamianie: ${suite.name} (${suite.script})...`);
  const result = spawnSync('node', [suite.script], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status === 0) {
    totalPassed++;
    console.log(`✅ SUKCES: ${suite.name}`);
  } else {
    totalFailed++;
    console.error(`❌ BŁĄD: ${suite.name} (kod wyjścia: ${result.status})`);
  }
}

console.log('\n========================================================================');
console.log(`📊 Podsumowanie zestawów testowych: ${totalPassed}/${testSuites.length} zdanych.`);
console.log('========================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
