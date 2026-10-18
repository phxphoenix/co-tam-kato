import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NEWS_DIR = path.resolve(process.cwd(), 'src', 'content', 'news');
const TMP_ARCHIVE_CACHE_FILE = path.join(os.tmpdir(), 'kato-archive-runtime-cache.json');

export interface ArchiveItemState {
  archived: boolean;
  manualOverride?: boolean;
  updatedAt?: number;
}

const memoryArchiveCache = new Map<string, ArchiveItemState>();

function readTmpCache(): Record<string, ArchiveItemState> {
  try {
    if (fs.existsSync(TMP_ARCHIVE_CACHE_FILE)) {
      const raw = fs.readFileSync(TMP_ARCHIVE_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    // Ignoruj błędy odczytu cache z /tmp
  }
  return {};
}

export function saveServerRuntimeArchiveState(
  slug: string,
  archived: boolean,
  manualOverride?: boolean
): void {
  const cleanSlug = slug.replace(/\.(md|mdx)$/, '');
  const entry: ArchiveItemState = {
    archived,
    ...(typeof manualOverride === 'boolean' ? { manualOverride } : {}),
    updatedAt: Date.now(),
  };
  memoryArchiveCache.set(cleanSlug, entry);

  try {
    const current = readTmpCache();
    current[cleanSlug] = entry;
    fs.writeFileSync(TMP_ARCHIVE_CACHE_FILE, JSON.stringify(current), 'utf8');
  } catch {
    // Ignoruj błędy zapisu do /tmp
  }
}

export function getServerRuntimeArchiveStates(): Record<string, ArchiveItemState> {
  const states: Record<string, ArchiveItemState> = {};

  // 1. Odczyt z lokalnych plików Markdown (jeśli katalog istnieje)
  if (fs.existsSync(NEWS_DIR)) {
    try {
      const files = fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
      for (const file of files) {
        const slug = file.replace(/\.(md|mdx)$/, '');
        const raw = fs.readFileSync(path.join(NEWS_DIR, file), 'utf8');
        const fmMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) continue;
        const fm = fmMatch[1];
        const archivedMatch = fm.match(/^archived\s*:\s*(true|false)/m);
        const overrideMatch = fm.match(/^manualOverride\s*:\s*(true|false)/m);
        const archived = archivedMatch ? archivedMatch[1] === 'true' : false;
        const manualOverride = overrideMatch ? overrideMatch[1] === 'true' : undefined;
        if (archived || manualOverride) {
          states[slug] = {
            archived,
            ...(typeof manualOverride === 'boolean' ? { manualOverride } : {}),
          };
        }
      }
    } catch {
      // Ignoruj błąd odczytu katalogu
    }
  }

  // 2. Nałożenie zmian z cache w /tmp oraz w pamięci RAM
  const tmpCache = readTmpCache();
  for (const [slug, state] of Object.entries(tmpCache)) {
    states[slug] = state;
  }
  for (const [slug, state] of memoryArchiveCache.entries()) {
    states[slug] = state;
  }

  return states;
}

/**
 * Modyfikuje pola archived i manualOverride w treści pliku Markdown.
 */
export function applyArchiveFrontmatter(
  rawContent: string,
  archived: boolean,
  manualOverride?: boolean
): { success: boolean; content?: string; error?: string } {
  const frontmatterMatch = rawContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { success: false, error: 'Niepoprawny format frontmattera.' };
  }

  let frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Aktualizacja lub dodanie pola archived
  if (/^archived\s*:/m.test(frontmatter)) {
    frontmatter = frontmatter.replace(/^archived\s*:.*$/m, `archived: ${archived}`);
  } else {
    frontmatter += `\narchived: ${archived}`;
  }

  // Aktualizacja lub dodanie pola manualOverride jeśli określone
  if (typeof manualOverride === 'boolean') {
    if (/^manualOverride\s*:/m.test(frontmatter)) {
      frontmatter = frontmatter.replace(/^manualOverride\s*:.*$/m, `manualOverride: ${manualOverride}`);
    } else {
      frontmatter += `\nmanualOverride: ${manualOverride}`;
    }
  }

  const updatedContent = `---\n${frontmatter.trim()}\n---${body}`;
  return { success: true, content: updatedContent };
}

/**
 * Aktualizuje pole archived oraz manualOverride w pliku Markdown artykułu.
 */
export function updateArticleArchive(
  slug: string,
  archived: boolean,
  manualOverride?: boolean
): {
  success: boolean;
  readOnly?: boolean;
  filePath?: string;
  content?: string;
  fileName?: string;
  error?: string;
} {
  try {
    const cleanSlug = slug.replace(/\.(md|mdx)$/, '');

    if (!fs.existsSync(NEWS_DIR)) {
      // W środowisku Serverless (np. Vercel), gdzie katalog src/content/news może nie być zbundlowany lokalnie,
      // zwracamy flagę readOnly, aby endpoint API mógł pobrać i zaktualizować plik bezpośrednio przez GitHub API.
      saveServerRuntimeArchiveState(cleanSlug, archived, manualOverride);
      return {
        success: true,
        readOnly: true,
        fileName: `${cleanSlug}.md`,
      };
    }

    const possibleFiles = [
      path.join(NEWS_DIR, `${cleanSlug}.md`),
      path.join(NEWS_DIR, `${cleanSlug}.mdx`),
    ];

    let targetFile = possibleFiles.find((p) => fs.existsSync(p));

    if (!targetFile) {
      const allFiles = fs.readdirSync(NEWS_DIR);
      const match = allFiles.find((file) => file.replace(/\.(md|mdx)$/, '') === cleanSlug);
      if (match) {
        targetFile = path.join(NEWS_DIR, match);
      }
    }

    if (!targetFile) {
      if (process.env.VERCEL === '1' || process.env.DEPLOY_TARGET === 'vercel') {
        saveServerRuntimeArchiveState(cleanSlug, archived, manualOverride);
        return {
          success: true,
          readOnly: true,
          fileName: `${cleanSlug}.md`,
        };
      }
      return { success: false, error: `Nie znaleziono pliku dla slugu "${cleanSlug}".` };
    }

    const rawContent = fs.readFileSync(targetFile, 'utf8');
    const updated = applyArchiveFrontmatter(rawContent, archived, manualOverride);

    if (!updated.success || !updated.content) {
      return { success: false, error: `${updated.error} (${targetFile})` };
    }

    saveServerRuntimeArchiveState(cleanSlug, archived, manualOverride);

    try {
      fs.writeFileSync(targetFile, updated.content, 'utf8');
      return { success: true, filePath: targetFile, content: updated.content, fileName: path.basename(targetFile) };
    } catch (writeErr: any) {
      if (writeErr?.code === 'EROFS' || String(writeErr?.message).includes('read-only')) {
        return {
          success: true,
          readOnly: true,
          filePath: targetFile,
          content: updated.content,
          fileName: path.basename(targetFile),
        };
      }
      throw writeErr;
    }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
