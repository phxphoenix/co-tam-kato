import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  getAllSources,
  getSourceById,
  getNextSourceId,
  validateUrl,
  validateSourceInput,
  addSource,
  updateSource,
  serializeSourcesMarkdown,
} from '../src/server/sources-service.ts';

console.log('Testing sources-service...');

// Backup original config/sources.md
const originalSourcesMd = fs.readFileSync('config/sources.md', 'utf8');

try {
  // 1. Get all sources
  const sources = getAllSources();
  assert.equal(sources.length, 29, `Expected 29 sources, got ${sources.length}`);
  console.log('✓ getAllSources returned 29 sources');

  // 2. Next ID
  const nextId = getNextSourceId(sources);
  assert.equal(nextId, '30');
  console.log('✓ getNextSourceId returned 30');

  // 3. URL Validation
  assert.ok(validateUrl('https://nospr.org.pl').valid);
  assert.ok(validateUrl('http://pik.katowice.pl/feed.xml').valid);
  assert.ok(!validateUrl('ftp://nospr.org.pl').valid);
  assert.ok(!validateUrl('invalid-url').valid);
  assert.ok(!validateUrl('').valid);
  console.log('✓ URL validation passed');

  // 4. Update status of source 1 to INACTIVE
  const updateRes = updateSource({ id: '1', status: 'INACTIVE' });
  assert.ok(updateRes.success);
  assert.equal(updateRes.source.status, 'INACTIVE');

  // Verify in file
  const reloaded = getAllSources();
  const item1 = reloaded.find((s) => s.id === '1');
  assert.equal(item1.status, 'INACTIVE');
  console.log('✓ Toggled source #1 to INACTIVE and saved to file');

  // 5. Update fields of source 1 (and revert to ACTIVE)
  const editRes = updateSource({
    id: '1',
    name: 'PIK Katowice (Edytowane | Test)',
    status: 'ACTIVE',
    hints: 'Nowe wskazówki z pipe | oraz opis',
  });
  assert.ok(editRes.success);
  assert.equal(editRes.source.name, 'PIK Katowice (Edytowane | Test)');
  assert.equal(editRes.source.status, 'ACTIVE');

  const reloaded2 = getAllSources();
  const item1v2 = reloaded2.find((s) => s.id === '1');
  assert.equal(item1v2.name, 'PIK Katowice (Edytowane | Test)');
  assert.equal(item1v2.hints, 'Nowe wskazówki z pipe | oraz opis');
  console.log('✓ Edited fields of source #1 and verified pipe handling');

  // 6. Add a new source (ID 30)
  const addRes = addSource({
    name: 'Nowe Źródło Testowe',
    type: 'DYNAMIC_WEB',
    url: 'https://katowice.eu/nowe-wydarzenia',
    category: 'Miejskie / Nowości',
    status: 'ACTIVE',
    hints: 'Testowe wskazówki z | pipe',
  });
  assert.ok(addRes.success);
  assert.equal(addRes.source.id, '30');
  assert.equal(addRes.source.type, 'DYNAMIC_WEB');

  const reloaded3 = getAllSources();
  assert.equal(reloaded3.length, 30);
  const item30 = reloaded3.find((s) => s.id === '30');
  assert.ok(item30);
  assert.equal(item30.name, 'Nowe Źródło Testowe');
  assert.equal(item30.hints, 'Testowe wskazówki z | pipe');
  console.log('✓ Successfully added new source #30 to table');

  // Verify preamble in file is intact
  const currentMd = fs.readFileSync('config/sources.md', 'utf8');
  assert.ok(currentMd.startsWith('# Baza Źródeł Wydarzeń – Katowice i Metropolia GZM'));
  assert.ok(currentMd.includes('## Instrukcje operacyjne dla Agenta AI (Ingestion Pipeline)'));
  assert.ok(currentMd.includes('1. **Filtrowanie:**'));
  console.log('✓ Preamble and AI instructions remain 100% intact');

  console.log('All sources-service tests passed successfully!');
} finally {
  // Restore original config/sources.md
  fs.writeFileSync('config/sources.md', originalSourcesMd, 'utf8');
  console.log('✓ Restored config/sources.md to original state');
}
