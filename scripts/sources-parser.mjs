import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses markdown table from string or file into structured source objects.
 *
 * @param {string} [input] File path or raw markdown content. Defaults to 'config/sources.md'.
 * @returns {Array<{id: string, name: string, type: 'RSS'|'WEB'|'DYNAMIC_WEB'|string, url: string, category: string, status: string, hints: string}>}
 */
export function parseSourcesMarkdown(input = path.resolve('config/sources.md')) {
  let content = input;
  if (!input.includes('\n') && fs.existsSync(input)) {
    content = fs.readFileSync(input, 'utf8');
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'));

  if (lines.length < 2) return [];

  const splitCells = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, '|'));

  // Locate header line
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    const normalized = cells.map((c) => c.toLowerCase());
    if (normalized.some((c) => c.includes('typ') || c.includes('type')) &&
        normalized.some((c) => c.includes('status'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const headerCells = splitCells(lines[headerIndex]);
  const colMap = {
    id: headerCells.findIndex((c) => /^id$/i.test(c)),
    name: headerCells.findIndex((c) => /^(nazwa|name)$/i.test(c)),
    type: headerCells.findIndex((c) => /^(typ|type)$/i.test(c)),
    url: headerCells.findIndex((c) => /^(url|link)$/i.test(c)),
    category: headerCells.findIndex((c) => /^(kategoria|category)$/i.test(c)),
    status: headerCells.findIndex((c) => /^status$/i.test(c)),
    hints: headerCells.findIndex((c) => /(wskaz[oó]wki|hint)/i.test(c)),
  };

  const records = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Skip separator lines like |---|---|
    if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(rawLine)) continue;

    const cells = splitCells(rawLine);
    if (cells.length < headerCells.length) continue;

    const get = (idx) => (idx >= 0 && idx < cells.length ? cells[idx].trim() : '');

    const record = {
      id: get(colMap.id),
      name: get(colMap.name),
      type: get(colMap.type).toUpperCase(),
      url: get(colMap.url),
      category: get(colMap.category),
      status: get(colMap.status).toUpperCase(),
      hints: get(colMap.hints),
    };

    if (record.id && record.url) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Loads only records with status 'ACTIVE' from sources.md.
 *
 * @param {string} [input] File path or raw markdown content.
 * @returns {Array<{id: string, name: string, type: 'RSS'|'WEB'|'DYNAMIC_WEB'|string, url: string, category: string, status: string, hints: string}>}
 */
export function loadActiveSources(input = path.resolve('config/sources.md')) {
  return parseSourcesMarkdown(input).filter((s) => s.status === 'ACTIVE');
}

/**
 * Escapes characters in a markdown table cell value.
 *
 * @param {string} [val]
 * @returns {string}
 */
export function escapeMarkdownCell(val) {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Serializes sources list into markdown table, preserving upper markdown preamble.
 *
 * @param {Array<{id: string, name: string, type: string, url: string, category: string, status: string, hints: string}>} sources
 * @param {string} [originalContent] Full text of existing sources.md
 * @returns {string}
 */
export function serializeSourcesMarkdown(sources, originalContent = '') {
  let preamble = '';

  const lineEnding = (originalContent && originalContent.includes('\r\n')) ? '\r\n' : '\n';

  if (originalContent) {
    const lines = originalContent.split(/\r?\n/);
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) {
        const prev = lines[i - 1]?.trim() || '';
        if (prev.startsWith('|') && /id/i.test(prev) && /status/i.test(prev)) {
          sepIdx = i;
          break;
        }
      }
    }
    if (sepIdx !== -1) {
      preamble = lines.slice(0, sepIdx + 1).join(lineEnding) + lineEnding;
    }
  }

  if (!preamble) {
    preamble = [
      '# Baza Źródeł Wydarzeń – Katowice i Metropolia GZM (Single Source of Truth)',
      '',
      '## Instrukcje operacyjne dla Agenta AI (Ingestion Pipeline)',
      '',
      '1. **Filtrowanie:** Przetwarzaj wyłącznie wiersze, w których kolumna `Status` ma wartość `ACTIVE`. Ignoruj wiersze ze statusem `INACTIVE` lub `TEMPLATE`.',
      '2. **Routing metody pobierania (Kolumna `Typ`):**',
      '   - **`RSS`**: Pobierz strumień za pomocą parsera XML/Atom.',
      '   - **`WEB`**: Pobierz kod HTML strony docelowej.',
      '   - **`DYNAMIC_WEB`**: Strona renderowana po stronie klienta (SPA/JS).',
      '3. **Izolacja błędów:** W przypadku błędu sieciowego zapisz ostrzeżenie w logach.',
      '4. **Deduplikacja i normalizacja:** Znormalizuj daty do formatu ISO 8601.',
      '',
      '---',
      '',
      '## Tabela Źródeł (Konfiguracja)',
      '',
      '| ID | Nazwa | Typ | URL | Kategoria | Status | Wskazówki dla agenta (Scraping Hints) |',
      '|---|---|---|---|---|---|---|',
      '',
    ].join(lineEnding);
  }

  const rows = sources.map((s) => {
    const id = s.id || '';
    const name = escapeMarkdownCell(s.name);
    const type = escapeMarkdownCell(s.type);
    const url = escapeMarkdownCell(s.url);
    const category = escapeMarkdownCell(s.category);
    const status = escapeMarkdownCell(s.status);
    const hints = escapeMarkdownCell(s.hints);
    return `| ${id} | ${name} | ${type} | ${url} | ${category} | ${status} | ${hints} |`;
  });

  return preamble + rows.join(lineEnding) + lineEnding;
}

