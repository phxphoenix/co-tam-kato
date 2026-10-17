import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSourcesMarkdown, loadActiveSources, serializeSourcesMarkdown } from './sources-parser.mjs';

console.log('Testing parseSourcesMarkdown...');

// 1. Test parsing real config/sources.md
const allSources = parseSourcesMarkdown();
assert.ok(allSources.length >= 29, `Expected at least 29 sources, got ${allSources.length}`);
console.log(`✓ Parsed ${allSources.length} total sources from config/sources.md`);

// 2. Test loading ACTIVE sources
const activeSources = loadActiveSources();
assert.ok(activeSources.length >= 29, `Expected at least 29 active sources, got ${activeSources.length}`);
assert.ok(activeSources.every((s) => s.status === 'ACTIVE'), 'All sources must have status ACTIVE');
console.log(`✓ Loaded ${activeSources.length} ACTIVE sources`);

// Verify first item
const first = activeSources[0];
assert.equal(first.id, '1');
assert.equal(first.name, 'PIK Katowice (Główne)');
assert.equal(first.type, 'WEB');
assert.equal(first.url, 'https://pik.katowice.pl/');
assert.equal(first.status, 'ACTIVE');
assert.ok(first.hints.includes('Główna lista nadchodzących'));
console.log('✓ First active source parsed correctly:', first.name);

// Verify types present
const types = new Set(activeSources.map((s) => s.type));
assert.ok(types.has('RSS'), 'Must contain RSS sources');
assert.ok(types.has('WEB'), 'Must contain WEB sources');
assert.ok(types.has('DYNAMIC_WEB'), 'Must contain DYNAMIC_WEB sources');
console.log('✓ Found source types:', [...types].join(', '));

// 3. Test filtering INACTIVE and TEMPLATE
const mockTable = `
| ID | Nazwa | Typ | URL | Kategoria | Status | Wskazówki dla agenta (Scraping Hints) |
|---|---|---|---|---|---|---|
| 101 | Active Site | WEB | https://example.com/1 | Kultura | ACTIVE | Parse this |
| 102 | Inactive Site | RSS | https://example.com/2 | Sport | INACTIVE | Ignore this |
| 103 | Template Site | DYNAMIC_WEB | https://example.com/3 | Alerty | TEMPLATE | Template row |
`;

const mockAll = parseSourcesMarkdown(mockTable);
assert.equal(mockAll.length, 3);
const mockActive = loadActiveSources(mockTable);
assert.equal(mockActive.length, 1);
assert.equal(mockActive[0].id, '101');
assert.equal(mockActive[0].name, 'Active Site');
console.log('✓ INACTIVE and TEMPLATE correctly filtered out');

// 4. Test serialization roundtrip on real config/sources.md
const originalSourcesMd = fs.readFileSync('config/sources.md', 'utf8');
const serialized = serializeSourcesMarkdown(allSources, originalSourcesMd);
assert.equal(serialized, originalSourcesMd, 'Serialized output must exactly match original file');
console.log('✓ Serialization roundtrip preserves config/sources.md 100% exactly');

// 5. Test pipe escaping during serialization and parsing
const sourceWithPipe = {
  id: '30',
  name: 'Klub Muzyczny A|B',
  type: 'WEB',
  url: 'https://klub.pl',
  category: 'Kluby | Muzyka',
  status: 'ACTIVE',
  hints: 'Spodek | NOSPR | MCK Katowice',
};
const tableWithPipes = serializeSourcesMarkdown([...allSources, sourceWithPipe], originalSourcesMd);
const parsedAgain = parseSourcesMarkdown(tableWithPipes);
const found = parsedAgain.find((s) => s.id === '30');
assert.ok(found, 'Added source #30 must be found');
assert.equal(found.name, 'Klub Muzyczny A|B');
assert.equal(found.category, 'Kluby | Muzyka');
assert.equal(found.hints, 'Spodek | NOSPR | MCK Katowice');
console.log('✓ Pipe escaping and unescaping roundtrip works perfectly');

console.log('All parser and serialization tests passed successfully!');

