import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PAGINATION_SETTINGS = {
  homePageSize: 12,
  archivePageSize: 24,
  adminArchivePageSize: 25,
};

export const DEFAULT_BALANCE_SETTINGS = {
  maxArticlesPerRun: 4,
  maxCandidates: 7,
  ticketedMaxShare3d: 0.40,
  rssPoolShare: 0.50,
  ticketedMaxPerRun: 2,
  ticketedMaxPerDay: 3,
  ticketedMinPerDay: 1,
  nosprMaxPerRun: 1,
  nosprMaxPerDay: 2,
  otherVenueMaxPerDay: 1,
  lastTicketsBonusPerDay: 1,
  poolMaxItemsPerTicketedSource: 5,
  maxPromptItems: 60,
  cycleCooldownDays: 7,
  weeklySummaryEnabled: true,
  weeklySummaryHorizonDays: 14,
};

const BALANCE_INTEGER_RANGES = {
  maxArticlesPerRun: [1, 12],
  maxCandidates: [1, 25],
  ticketedMaxPerRun: [0, 12],
  ticketedMaxPerDay: [0, 20],
  ticketedMinPerDay: [0, 10],
  nosprMaxPerRun: [0, 5],
  nosprMaxPerDay: [0, 10],
  otherVenueMaxPerDay: [0, 10],
  lastTicketsBonusPerDay: [0, 5],
  poolMaxItemsPerTicketedSource: [1, 15],
  maxPromptItems: [20, 120],
  cycleCooldownDays: [0, 30],
  weeklySummaryHorizonDays: [3, 30],
};

const BALANCE_FLOAT_RANGES = {
  ticketedMaxShare3d: [0, 1],
  rssPoolShare: [0.10, 0.90],
};

/**
 * Validates and normalizes balance settings object.
 * Missing or invalid values are replaced with defaults and a warning is logged.
 *
 * @param {Record<string, any>} [raw]
 * @returns {typeof DEFAULT_BALANCE_SETTINGS}
 */
export function validateBalanceSettings(raw = {}) {
  const result = { ...DEFAULT_BALANCE_SETTINGS };
  if (!raw || typeof raw !== 'object') {
    console.warn('[BalanceSettings] Nieprawidłowy obiekt ustawień równowagi – użyto wartości domyślnych.');
    return result;
  }

  for (const [key, defaultVal] of Object.entries(DEFAULT_BALANCE_SETTINGS)) {
    const val = raw[key];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      console.warn(`[BalanceSettings] Brak parametru "${key}" – użyto wartości domyślnej (${defaultVal}).`);
      result[key] = defaultVal;
      continue;
    }

    if (typeof defaultVal === 'boolean') {
      if (typeof val === 'boolean') {
        result[key] = val;
      } else if (typeof val === 'string' && /^(true|false)$/i.test(val.trim())) {
        result[key] = val.trim().toLowerCase() === 'true';
      } else {
        console.warn(`[BalanceSettings] Nieprawidłowa wartość logiczna dla "${key}": ${JSON.stringify(val)} – użyto wartości domyślnej (${defaultVal}).`);
        result[key] = defaultVal;
      }
      continue;
    }

    if (key in BALANCE_FLOAT_RANGES) {
      const [min, max] = BALANCE_FLOAT_RANGES[key];
      let num = NaN;
      if (typeof val === 'number') {
        num = val;
      } else if (typeof val === 'string' && /^-?\d+(?:\.\d+)?$/.test(val.trim())) {
        num = Number(val.trim());
      }
      if (Number.isFinite(num) && num >= min && num <= max) {
        result[key] = Math.round(num * 100) / 100;
      } else {
        console.warn(`[BalanceSettings] Nieprawidłowa wartość udziału (${min}–${max}) dla "${key}": ${JSON.stringify(val)} – użyto wartości domyślnej (${defaultVal}).`);
        result[key] = defaultVal;
      }
      continue;
    }

    const [minInt, maxInt] = BALANCE_INTEGER_RANGES[key] || [0, Number.MAX_SAFE_INTEGER];
    let intVal = NaN;
    if (typeof val === 'number') {
      intVal = val;
    } else if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) {
      intVal = Number(val.trim());
    }
    if (Number.isInteger(intVal) && intVal >= minInt && intVal <= maxInt) {
      result[key] = intVal;
    } else {
      console.warn(`[BalanceSettings] Nieprawidłowa wartość całkowita (${minInt}–${maxInt}) dla "${key}": ${JSON.stringify(val)} – użyto wartości domyślnej (${defaultVal}).`);
      result[key] = defaultVal;
    }
  }

  // Walidacja krzyżowa zależności między parametrami
  if (result.maxCandidates < result.maxArticlesPerRun) {
    console.warn(`[BalanceSettings] maxCandidates (${result.maxCandidates}) < maxArticlesPerRun (${result.maxArticlesPerRun}) – podniesiono do ${result.maxArticlesPerRun}.`);
    result.maxCandidates = result.maxArticlesPerRun;
  }
  if (result.ticketedMinPerDay > result.ticketedMaxPerDay) {
    console.warn(`[BalanceSettings] ticketedMinPerDay (${result.ticketedMinPerDay}) > ticketedMaxPerDay (${result.ticketedMaxPerDay}) – ograniczono do ${result.ticketedMaxPerDay}.`);
    result.ticketedMinPerDay = result.ticketedMaxPerDay;
  }
  if (result.nosprMaxPerRun > result.ticketedMaxPerRun) {
    console.warn(`[BalanceSettings] nosprMaxPerRun (${result.nosprMaxPerRun}) > ticketedMaxPerRun (${result.ticketedMaxPerRun}) – ograniczono do ${result.ticketedMaxPerRun}.`);
    result.nosprMaxPerRun = result.ticketedMaxPerRun;
  }
  if (result.nosprMaxPerDay > result.ticketedMaxPerDay) {
    console.warn(`[BalanceSettings] nosprMaxPerDay (${result.nosprMaxPerDay}) > ticketedMaxPerDay (${result.ticketedMaxPerDay}) – ograniczono do ${result.ticketedMaxPerDay}.`);
    result.nosprMaxPerDay = result.ticketedMaxPerDay;
  }

  return result;
}

/**
 * Parses balance settings from config/sources.md content or file path.
 *
 * @param {string} [input] File path or raw markdown content. Defaults to 'config/sources.md'.
 * @returns {typeof DEFAULT_BALANCE_SETTINGS}
 */
export function parseBalanceSettings(input = path.resolve('config/sources.md')) {
  let content = input;
  if (input === undefined || input === null) {
    const defaultPath = path.resolve('config/sources.md');
    content = fs.existsSync(defaultPath) ? fs.readFileSync(defaultPath, 'utf8') : '';
  } else if (typeof input === 'string' && !input.includes('\n') && fs.existsSync(input)) {
    content = fs.readFileSync(input, 'utf8');
  }

  if (!content || typeof content !== 'string') {
    console.warn('[BalanceSettings] Brak treści konfiguracji równowagi – użyto wartości domyślnych.');
    return { ...DEFAULT_BALANCE_SETTINGS };
  }

  const raw = {};
  for (const key of Object.keys(DEFAULT_BALANCE_SETTINGS)) {
    const regex = new RegExp(`(?:^|\\r?\\n)\\s*(?:[-*]\\s*)?\`?${key}\`?\\s*[:=|]\\s*([^\\r\\n]+)`, 'i');
    const match = content.match(regex);
    if (match && match[1] !== undefined) {
      raw[key] = match[1].trim();
    }
  }

  return validateBalanceSettings(raw);
}

/**
 * Parses pagination settings (homePageSize, archivePageSize, adminArchivePageSize)
 * from config/sources.md content or file path.
 *
 * @param {string} [input] File path or raw markdown content. Defaults to 'config/sources.md'.
 * @returns {{homePageSize: number, archivePageSize: number, adminArchivePageSize: number}}
 */
export function parsePaginationSettings(input = path.resolve('config/sources.md')) {
  let content = input;
  if (!input) {
    const defaultPath = path.resolve('config/sources.md');
    content = fs.existsSync(defaultPath) ? fs.readFileSync(defaultPath, 'utf8') : '';
  } else if (!input.includes('\n') && fs.existsSync(input)) {
    content = fs.readFileSync(input, 'utf8');
  }

  const result = { ...DEFAULT_PAGINATION_SETTINGS };
  if (!content || typeof content !== 'string') return result;

  const extractNumber = (key, fallback) => {
    const regex = new RegExp(`(?:^|\\r?\\n)\\s*(?:[-*]\\s*)?\`?${key}\`?\\s*[:=|]\\s*(\\d+)`, 'i');
    const match = content.match(regex);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return fallback;
  };

  result.homePageSize = extractNumber('homePageSize', DEFAULT_PAGINATION_SETTINGS.homePageSize);
  result.archivePageSize = extractNumber('archivePageSize', DEFAULT_PAGINATION_SETTINGS.archivePageSize);
  result.adminArchivePageSize = extractNumber('adminArchivePageSize', DEFAULT_PAGINATION_SETTINGS.adminArchivePageSize);

  return result;
}

/**
 * Updates or inserts pagination settings inside markdown content while preserving the rest of the file.
 *
 * @param {string} originalContent
 * @param {{homePageSize: number, archivePageSize: number, adminArchivePageSize: number}} settings
 * @returns {string}
 */
export function serializePaginationSettingsInMarkdown(originalContent, settings) {
  const lineEnding = originalContent && originalContent.includes('\r\n') ? '\r\n' : '\n';
  const merged = {
    homePageSize: Number(settings?.homePageSize) || DEFAULT_PAGINATION_SETTINGS.homePageSize,
    archivePageSize: Number(settings?.archivePageSize) || DEFAULT_PAGINATION_SETTINGS.archivePageSize,
    adminArchivePageSize: Number(settings?.adminArchivePageSize) || DEFAULT_PAGINATION_SETTINGS.adminArchivePageSize,
  };

  let updated = originalContent || '';
  const hasHome = /(?:^|\r?\n)\s*(?:[-*]\s*)?`?homePageSize`?\s*[:=]\s*\d+/i.test(updated);
  const hasArchive = /(?:^|\r?\n)\s*(?:[-*]\s*)?`?archivePageSize`?\s*[:=]\s*\d+/i.test(updated);
  const hasAdmin = /(?:^|\r?\n)\s*(?:[-*]\s*)?`?adminArchivePageSize`?\s*[:=]\s*\d+/i.test(updated);

  if (hasHome && hasArchive && hasAdmin) {
    updated = updated.replace(
      /(^|\r?\n)(\s*(?:[-*]\s*)?`?homePageSize`?\s*[:=]\s*)\d+/i,
      `$1$2${merged.homePageSize}`
    );
    updated = updated.replace(
      /(^|\r?\n)(\s*(?:[-*]\s*)?`?archivePageSize`?\s*[:=]\s*)\d+/i,
      `$1$2${merged.archivePageSize}`
    );
    updated = updated.replace(
      /(^|\r?\n)(\s*(?:[-*]\s*)?`?adminArchivePageSize`?\s*[:=]\s*)\d+/i,
      `$1$2${merged.adminArchivePageSize}`
    );
    return updated;
  }

  const sectionBlock = [
    '## Ustawienia wyświetlania i paginacji',
    '',
    `- \`homePageSize\`: ${merged.homePageSize}`,
    `- \`archivePageSize\`: ${merged.archivePageSize}`,
    `- \`adminArchivePageSize\`: ${merged.adminArchivePageSize}`,
    '',
    '---',
    '',
  ].join(lineEnding);

  const balanceHeadingIdx = updated.indexOf('## Ustawienia równowagi treści');
  if (balanceHeadingIdx !== -1) {
    return (
      updated.slice(0, balanceHeadingIdx) +
      sectionBlock +
      updated.slice(balanceHeadingIdx)
    );
  }

  const tableHeadingIdx = updated.indexOf('## Tabela Źródeł');
  if (tableHeadingIdx !== -1) {
    return (
      updated.slice(0, tableHeadingIdx) +
      sectionBlock +
      updated.slice(tableHeadingIdx)
    );
  }

  return sectionBlock + updated;
}

/**
 * Updates or inserts AI worker & balance settings inside markdown content while preserving the rest of the file.
 *
 * @param {string} originalContent
 * @param {Partial<typeof DEFAULT_BALANCE_SETTINGS>} settings
 * @returns {string}
 */
export function serializeBalanceSettingsInMarkdown(originalContent, settings) {
  const lineEnding = originalContent && originalContent.includes('\r\n') ? '\r\n' : '\n';
  const normalized = validateBalanceSettings({
    ...DEFAULT_BALANCE_SETTINGS,
    ...(settings || {}),
  });

  const formattedLines = Object.entries(DEFAULT_BALANCE_SETTINGS).map(([key]) => {
    const val = normalized[key];
    if (key === 'ticketedMaxShare3d' || key === 'rssPoolShare') {
      return `- \`${key}\`: ${Number(val).toFixed(2)}`;
    }
    return `- \`${key}\`: ${val}`;
  });

  const updated = originalContent || '';
  const sectionRegex =
    /(^|\r?\n)(##\s+Ustawienia równowagi treści[^\r\n]*\r?\n)([\s\S]*?)(\r?\n---\r?\n|\r?\n##\s+|$)/;

  if (sectionRegex.test(updated)) {
    return updated.replace(
      sectionRegex,
      (_, prefix, headingLine, _body, suffix) =>
        `${prefix}${headingLine}${lineEnding}${formattedLines.join(lineEnding)}${lineEnding}${suffix}`
    );
  }

  const sectionBlock = [
    '## Ustawienia równowagi treści (Agent AI)',
    '',
    ...formattedLines,
    '',
    '---',
    '',
  ].join(lineEnding);

  const tableHeadingIdx = updated.indexOf('## Tabela Źródeł');
  if (tableHeadingIdx !== -1) {
    return (
      updated.slice(0, tableHeadingIdx) +
      sectionBlock +
      updated.slice(tableHeadingIdx)
    );
  }

  return sectionBlock + updated;
}

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
      '## Ustawienia wyświetlania i paginacji',
      '',
      `- \`homePageSize\`: ${DEFAULT_PAGINATION_SETTINGS.homePageSize}`,
      `- \`archivePageSize\`: ${DEFAULT_PAGINATION_SETTINGS.archivePageSize}`,
      `- \`adminArchivePageSize\`: ${DEFAULT_PAGINATION_SETTINGS.adminArchivePageSize}`,
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
