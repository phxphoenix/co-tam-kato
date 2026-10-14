import fs from 'node:fs';
import path from 'node:path';

const NEWS_DIR = path.resolve(process.cwd(), 'src', 'content', 'news');

/**
 * Aktualizuje pole archived oraz manualOverride w pliku Markdown artykułu.
 */
export function updateArticleArchive(
  slug: string,
  archived: boolean,
  manualOverride?: boolean
): { success: boolean; filePath?: string; error?: string } {
  try {
    if (!fs.existsSync(NEWS_DIR)) {
      return { success: false, error: `Katalog ${NEWS_DIR} nie istnieje.` };
    }

    const cleanSlug = slug.replace(/\.(md|mdx)$/, '');
    const possibleFiles = [
      path.join(NEWS_DIR, `${cleanSlug}.md`),
      path.join(NEWS_DIR, `${cleanSlug}.mdx`),
    ];

    let targetFile = possibleFiles.find((p) => fs.existsSync(p));

    if (!targetFile) {
      // Wyszukajmy po nazwie pliku ignorując ewentualne różnice
      const allFiles = fs.readdirSync(NEWS_DIR);
      const match = allFiles.find((file) => file.replace(/\.(md|mdx)$/, '') === cleanSlug);
      if (match) {
        targetFile = path.join(NEWS_DIR, match);
      }
    }

    if (!targetFile) {
      return { success: false, error: `Nie znaleziono pliku dla slugu "${cleanSlug}".` };
    }

    const rawContent = fs.readFileSync(targetFile, 'utf8');
    const frontmatterMatch = rawContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);

    if (!frontmatterMatch) {
      return { success: false, error: `Niepoprawny format frontmattera w ${targetFile}.` };
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
    fs.writeFileSync(targetFile, updatedContent, 'utf8');

    return { success: true, filePath: targetFile };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
