import fs from 'node:fs';
import path from 'node:path';

export type SourceType = 'RSS' | 'WEB' | 'DYNAMIC_WEB';
export type SourceStatus = 'ACTIVE' | 'INACTIVE' | 'TEMPLATE' | string;

export interface EventSourceItem {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  category: string;
  status: SourceStatus;
  hints: string;
}

export interface AddSourceInput {
  name: string;
  type: SourceType | string;
  url: string;
  category?: string;
  hints?: string;
  status?: SourceStatus;
}

export interface UpdateSourceInput {
  id: string;
  name?: string;
  type?: SourceType | string;
  url?: string;
  category?: string;
  hints?: string;
  status?: SourceStatus;
}

export interface PaginationSettings {
  homePageSize: number;
  archivePageSize: number;
  adminArchivePageSize: number;
}

export const DEFAULT_PAGINATION_SETTINGS: PaginationSettings = {
  homePageSize: 12,
  archivePageSize: 24,
  adminArchivePageSize: 25,
};

const SOURCES_FILE = path.resolve(process.cwd(), 'config', 'sources.md');

/**
 * Parses pagination settings (homePageSize, archivePageSize, adminArchivePageSize)
 * from config/sources.md content or file path.
 */
export function parsePaginationSettings(contentOrPath?: string): PaginationSettings {
  let content = contentOrPath;
  if (!content) {
    if (!fs.existsSync(SOURCES_FILE)) return { ...DEFAULT_PAGINATION_SETTINGS };
    content = fs.readFileSync(SOURCES_FILE, 'utf8');
  } else if (!content.includes('\n') && fs.existsSync(content)) {
    content = fs.readFileSync(content, 'utf8');
  }

  const result: PaginationSettings = { ...DEFAULT_PAGINATION_SETTINGS };
  if (!content || typeof content !== 'string') return result;

  const extractNumber = (key: keyof PaginationSettings, fallback: number): number => {
    const regex = new RegExp(`(?:^|\\r?\\n)\\s*(?:[-*]\\s*)?\`?${key}\`?\\s*[:=|]\\s*(\\d+)`, 'i');
    const match = content!.match(regex);
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
  result.adminArchivePageSize = extractNumber(
    'adminArchivePageSize',
    DEFAULT_PAGINATION_SETTINGS.adminArchivePageSize
  );

  return result;
}

/**
 * Returns the current pagination settings from config/sources.md (with defaults fallback).
 */
export function getPaginationSettings(): PaginationSettings {
  return parsePaginationSettings();
}

/**
 * Validates pagination settings input.
 */
export function validatePaginationSettings(
  input: Partial<PaginationSettings>
): { valid: boolean; settings?: PaginationSettings; error?: string } {
  const current = getPaginationSettings();
  const merged: PaginationSettings = {
    homePageSize:
      input.homePageSize !== undefined ? Number(input.homePageSize) : current.homePageSize,
    archivePageSize:
      input.archivePageSize !== undefined ? Number(input.archivePageSize) : current.archivePageSize,
    adminArchivePageSize:
      input.adminArchivePageSize !== undefined
        ? Number(input.adminArchivePageSize)
        : current.adminArchivePageSize,
  };

  const fields: Array<{ key: keyof PaginationSettings; label: string }> = [
    { key: 'homePageSize', label: 'Rozmiar strony głównej (homePageSize)' },
    { key: 'archivePageSize', label: 'Rozmiar strony archiwum (archivePageSize)' },
    { key: 'adminArchivePageSize', label: 'Rozmiar strony Panelu Archive (adminArchivePageSize)' },
  ];

  for (const field of fields) {
    const val = merged[field.key];
    if (!Number.isInteger(val) || val < 1 || val > 500) {
      return {
        valid: false,
        error: `${field.label} musi być liczbą całkowitą z przedziału od 1 do 500.`,
      };
    }
  }

  return { valid: true, settings: merged };
}

/**
 * Updates or inserts pagination settings inside markdown content while preserving the rest of the file.
 */
export function serializePaginationSettingsInMarkdown(
  originalContent: string,
  settings: PaginationSettings
): string {
  const lineEnding = originalContent && originalContent.includes('\r\n') ? '\r\n' : '\n';
  const merged: PaginationSettings = {
    homePageSize: Number(settings?.homePageSize) || DEFAULT_PAGINATION_SETTINGS.homePageSize,
    archivePageSize: Number(settings?.archivePageSize) || DEFAULT_PAGINATION_SETTINGS.archivePageSize,
    adminArchivePageSize:
      Number(settings?.adminArchivePageSize) || DEFAULT_PAGINATION_SETTINGS.adminArchivePageSize,
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

  const tableHeadingIdx = updated.indexOf('## Tabela Źródeł');
  if (tableHeadingIdx !== -1) {
    return updated.slice(0, tableHeadingIdx) + sectionBlock + updated.slice(tableHeadingIdx);
  }

  return sectionBlock + updated;
}

/**
 * Updates pagination settings in config/sources.md.
 */
export function updatePaginationSettings(input: Partial<PaginationSettings>): {
  success: boolean;
  paginationSettings?: PaginationSettings;
  sources?: EventSourceItem[];
  readOnly?: boolean;
  content?: string;
  error?: string;
} {
  const validation = validatePaginationSettings(input);
  if (!validation.valid || !validation.settings) {
    return { success: false, error: validation.error };
  }

  let originalContent = '';
  if (fs.existsSync(SOURCES_FILE)) {
    originalContent = fs.readFileSync(SOURCES_FILE, 'utf8');
  } else {
    originalContent = serializeSourcesMarkdown([], '');
  }

  const newContent = serializePaginationSettingsInMarkdown(originalContent, validation.settings);
  const writeRes = writeSourcesToFile(newContent);

  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }

  const sources = parseSourcesMarkdown(newContent);
  return {
    success: true,
    paginationSettings: validation.settings,
    sources,
    readOnly: writeRes.readOnly,
    content: writeRes.content,
  };
}

/**
 * Escapes characters in a markdown table cell value.
 */
export function escapeMarkdownCell(val?: string | null): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Splits a markdown table row into individual cells, properly respecting escaped pipes (\\|).
 */
export function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|').replace(/\\\\/g, '\\'));
}

/**
 * Parses markdown table from string or file into structured source objects.
 */
export function parseSourcesMarkdown(contentOrPath?: string): EventSourceItem[] {
  let content = contentOrPath;
  if (!content) {
    if (!fs.existsSync(SOURCES_FILE)) return [];
    content = fs.readFileSync(SOURCES_FILE, 'utf8');
  } else if (!content.includes('\n') && fs.existsSync(content)) {
    content = fs.readFileSync(content, 'utf8');
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'));

  if (lines.length < 2) return [];

  // Locate header line
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    const normalized = cells.map((c) => c.toLowerCase());
    if (
      normalized.some((c) => c.includes('typ') || c.includes('type')) &&
      normalized.some((c) => c.includes('status'))
    ) {
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

  const records: EventSourceItem[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Skip separator lines like |---|---|
    if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(rawLine)) continue;

    const cells = splitCells(rawLine);
    if (cells.length < headerCells.length) continue;

    const get = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx].trim() : '');

    const record: EventSourceItem = {
      id: get(colMap.id),
      name: get(colMap.name),
      type: get(colMap.type).toUpperCase() as SourceType,
      url: get(colMap.url),
      category: get(colMap.category),
      status: get(colMap.status).toUpperCase() as SourceStatus,
      hints: get(colMap.hints),
    };

    if (record.id && record.url) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Serializes sources list into markdown table, preserving upper markdown preamble.
 */
export function serializeSourcesMarkdown(sources: EventSourceItem[], originalContent = ''): string {
  let preamble = '';
  const lineEnding = originalContent && originalContent.includes('\r\n') ? '\r\n' : '\n';

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

/**
 * Returns all sources (both ACTIVE and INACTIVE) from config/sources.md.
 */
export function getAllSources(): EventSourceItem[] {
  return parseSourcesMarkdown();
}

/**
 * Returns a specific source by its ID.
 */
export function getSourceById(id: string): EventSourceItem | undefined {
  const sources = getAllSources();
  return sources.find((s) => String(s.id).trim() === String(id).trim());
}

/**
 * Computes the next free numeric ID.
 */
export function getNextSourceId(sources: EventSourceItem[]): string {
  const numericIds = sources
    .map((s) => parseInt(s.id, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  return String(maxId + 1);
}

/**
 * Validates a web URL format (must be http:// or https://).
 */
export function validateUrl(urlStr: string): { valid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) {
    return { valid: false, error: 'Adres URL jest wymagany.' };
  }

  const trimmed = urlStr.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, error: 'Adres URL musi rozpoczynać się od http:// lub https://' };
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return { valid: false, error: 'Nieprawidłowa domena w adresie URL.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Nieprawidłowy format adresu URL.' };
  }
}

/**
 * Validates source input data.
 */
export function validateSourceInput(
  input: Partial<AddSourceInput>,
  isNew = false
): { valid: boolean; error?: string } {
  if (isNew || input.name !== undefined) {
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
      return { valid: false, error: 'Nazwa źródła jest wymagana.' };
    }
  }

  if (isNew || input.url !== undefined) {
    const urlValidation = validateUrl(input.url || '');
    if (!urlValidation.valid) {
      return urlValidation;
    }
  }

  if (isNew || input.type !== undefined) {
    const validTypes: SourceType[] = ['RSS', 'WEB', 'DYNAMIC_WEB'];
    const normalizedType = String(input.type || '').toUpperCase() as SourceType;
    if (!validTypes.includes(normalizedType)) {
      return {
        valid: false,
        error: `Nieprawidłowy typ źródła. Dozwolone: ${validTypes.join(', ')}`,
      };
    }
  }

  if (input.status !== undefined) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'TEMPLATE'];
    const normalizedStatus = String(input.status).toUpperCase();
    if (!validStatuses.includes(normalizedStatus)) {
      return {
        valid: false,
        error: `Nieprawidłowy status. Dozwolone: ${validStatuses.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Writes the serialized content to config/sources.md.
 */
export function writeSourcesToFile(content: string): {
  success: boolean;
  filePath?: string;
  content?: string;
  readOnly?: boolean;
  error?: string;
} {
  try {
    try {
      const dir = path.dirname(SOURCES_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SOURCES_FILE, content, 'utf8');
      return { success: true, filePath: SOURCES_FILE, content };
    } catch (writeErr: any) {
      if (writeErr?.code === 'EROFS' || String(writeErr?.message).includes('read-only')) {
        return {
          success: true,
          readOnly: true,
          filePath: SOURCES_FILE,
          content,
        };
      }
      throw writeErr;
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Błąd zapisu pliku config/sources.md: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Adds a new source to config/sources.md at the end of the table.
 */
export function addSource(input: AddSourceInput): {
  success: boolean;
  source?: EventSourceItem;
  sources?: EventSourceItem[];
  readOnly?: boolean;
  content?: string;
  error?: string;
} {
  const validation = validateSourceInput(input, true);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  let originalContent = '';
  if (fs.existsSync(SOURCES_FILE)) {
    originalContent = fs.readFileSync(SOURCES_FILE, 'utf8');
  }

  const sources = parseSourcesMarkdown(originalContent);
  const nextId = getNextSourceId(sources);

  const newSource: EventSourceItem = {
    id: nextId,
    name: input.name.trim(),
    type: String(input.type).toUpperCase() as SourceType,
    url: input.url.trim(),
    category: (input.category || '').trim(),
    status: (input.status || 'ACTIVE').toUpperCase() as SourceStatus,
    hints: (input.hints || '').trim(),
  };

  const updatedSources = [...sources, newSource];
  const newContent = serializeSourcesMarkdown(updatedSources, originalContent);
  const writeRes = writeSourcesToFile(newContent);

  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }

  return {
    success: true,
    source: newSource,
    sources: updatedSources,
    readOnly: writeRes.readOnly,
    content: writeRes.content,
  };
}

/**
 * Updates an existing source in config/sources.md.
 */
export function updateSource(input: UpdateSourceInput): {
  success: boolean;
  source?: EventSourceItem;
  sources?: EventSourceItem[];
  readOnly?: boolean;
  content?: string;
  error?: string;
} {
  if (!input.id || !String(input.id).trim()) {
    return { success: false, error: 'Parametr ID źródła jest wymagany.' };
  }

  const validation = validateSourceInput(input, false);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  let originalContent = '';
  if (fs.existsSync(SOURCES_FILE)) {
    originalContent = fs.readFileSync(SOURCES_FILE, 'utf8');
  }

  const sources = parseSourcesMarkdown(originalContent);
  const targetId = String(input.id).trim();
  const index = sources.findIndex((s) => String(s.id).trim() === targetId);

  if (index === -1) {
    return { success: false, error: `Nie odnaleziono źródła o ID "${targetId}".` };
  }

  const existing = sources[index];
  const updatedItem: EventSourceItem = {
    id: existing.id,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    type:
      input.type !== undefined
        ? (String(input.type).toUpperCase() as SourceType)
        : existing.type,
    url: input.url !== undefined ? input.url.trim() : existing.url,
    category: input.category !== undefined ? input.category.trim() : existing.category,
    status:
      input.status !== undefined
        ? (String(input.status).toUpperCase() as SourceStatus)
        : existing.status,
    hints: input.hints !== undefined ? input.hints.trim() : existing.hints,
  };

  const updatedSources = [...sources];
  updatedSources[index] = updatedItem;

  const newContent = serializeSourcesMarkdown(updatedSources, originalContent);
  const writeRes = writeSourcesToFile(newContent);

  if (!writeRes.success) {
    return { success: false, error: writeRes.error };
  }

  return {
    success: true,
    source: updatedItem,
    sources: updatedSources,
    readOnly: writeRes.readOnly,
    content: writeRes.content,
  };
}
