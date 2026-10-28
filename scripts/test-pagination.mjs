import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  getPaginationSettings,
  updatePaginationSettings,
  validatePaginationSettings,
  getAllSources,
} from '../src/server/sources-service.ts';
import {
  parsePaginationSettings,
  loadActiveSources,
} from './sources-parser.mjs';
import {
  getPaginationPages,
  getPaginationMeta,
  buildPageSizeOptions,
  ARCHIVE_PAGE_SIZE_OPTIONS,
  ADMIN_ARCHIVE_PAGE_SIZE_OPTIONS,
} from '../src/lib/pagination.ts';

console.log('Testing pagination configuration & logic...');

const originalSourcesMd = fs.readFileSync('config/sources.md', 'utf8');

try {
  // 1. Default values in config/sources.md
  const initialSettings = getPaginationSettings();
  assert.deepEqual(initialSettings, {
    homePageSize: 12,
    archivePageSize: 24,
    adminArchivePageSize: 25,
  });
  console.log('✓ Default pagination settings read from config/sources.md (12 / 24 / 25)');

  const parserSettings = parsePaginationSettings();
  assert.deepEqual(parserSettings, initialSettings);
  console.log('✓ scripts/sources-parser.mjs reads identical pagination settings');

  // 2. Update pagination settings in config/sources.md and verify sources table is intact
  const updateRes = updatePaginationSettings({
    homePageSize: 18,
    archivePageSize: 36,
    adminArchivePageSize: 50,
  });
  assert.ok(updateRes.success);
  assert.deepEqual(updateRes.paginationSettings, {
    homePageSize: 18,
    archivePageSize: 36,
    adminArchivePageSize: 50,
  });

  const reloadedSettings = getPaginationSettings();
  assert.deepEqual(reloadedSettings, {
    homePageSize: 18,
    archivePageSize: 36,
    adminArchivePageSize: 50,
  });

  const allSourcesAfterUpdate = getAllSources();
  const activeSourcesAfterUpdate = loadActiveSources();
  assert.equal(allSourcesAfterUpdate.length, 29);
  assert.equal(activeSourcesAfterUpdate.length, 29);
  console.log('✓ Updating pagination settings in config/sources.md preserves all 29 sources');

  // 3. Validation tests
  assert.ok(!validatePaginationSettings({ homePageSize: 0 }).valid);
  assert.ok(!validatePaginationSettings({ archivePageSize: -6 }).valid);
  assert.ok(!validatePaginationSettings({ adminArchivePageSize: 501 }).valid);
  assert.ok(validatePaginationSettings({ homePageSize: 6, archivePageSize: 12, adminArchivePageSize: 10 }).valid);
  console.log('✓ Pagination settings validation works properly');

  // 4. Smart ellipsis page numbers (1 ... 4 5 6 ... 20)
  assert.deepEqual(getPaginationPages(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPaginationPages(5, 20), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]);
  assert.deepEqual(getPaginationPages(2, 20), [1, 2, 3, 4, 5, 'ellipsis', 20]);
  assert.deepEqual(getPaginationPages(19, 20), [1, 'ellipsis', 16, 17, 18, 19, 20]);
  console.log('✓ Smart ellipsis pagination tokens verified (e.g. 1 ... 4 5 6 ... 20)');

  // 5. Pagination meta & auto-correction of currentPage > totalPages
  const metaPage1 = getPaginationMeta(1, 24, 55);
  assert.equal(metaPage1.totalPages, 3);
  assert.equal(metaPage1.safeCurrentPage, 1);
  assert.equal(metaPage1.counterText, 'Wyświetlanie 1–24 z 55 artykułów');

  const metaOverflow = getPaginationMeta(5, 25, 40);
  assert.equal(metaOverflow.totalPages, 2);
  assert.equal(metaOverflow.safeCurrentPage, 2);
  assert.equal(metaOverflow.counterText, 'Wyświetlanie 26–40 z 40 artykułów');

  const metaEmpty = getPaginationMeta(3, 12, 0);
  assert.equal(metaEmpty.totalPages, 1);
  assert.equal(metaEmpty.safeCurrentPage, 1);
  assert.equal(metaEmpty.counterText, 'Wyświetlanie 0–0 z 0 artykułów');
  console.log('✓ Counter format ("Wyświetlanie X–Y z Z artykułów") and auto-correction verified');

  // 6. Page size options
  assert.deepEqual(buildPageSizeOptions(ARCHIVE_PAGE_SIZE_OPTIONS, 24), [12, 24, 48, 96]);
  assert.deepEqual(buildPageSizeOptions(ARCHIVE_PAGE_SIZE_OPTIONS, 18), [12, 18, 24, 48, 96]);
  assert.deepEqual(buildPageSizeOptions(ADMIN_ARCHIVE_PAGE_SIZE_OPTIONS, 25), [10, 25, 50, 100]);
  console.log('✓ Page size selector options verified for Archive and Admin Archive');

  console.log('All pagination tests passed successfully!');
} finally {
  fs.writeFileSync('config/sources.md', originalSourcesMd, 'utf8');
  console.log('✓ Restored config/sources.md to original state');
}
