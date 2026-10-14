import fs from 'node:fs';
import path from 'node:path';
import { validateArchivePeriod, type ValidationResult } from '../lib/archive-validation.ts';

export { validateArchivePeriod, type ValidationResult };

const ROOT_DIR = process.cwd();
const SETTINGS_DIR = path.join(ROOT_DIR, 'src', 'content', 'settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'archive.json');

export interface ArchiveSettings {
  archiveAfterDays: number;
}

/**
 * Pobiera bieżące ustawienia archiwizacji
 */
export function getArchiveSettings(): ArchiveSettings {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const data = JSON.parse(content);
      const validation = validateArchivePeriod(data.archiveAfterDays);
      if (validation.valid && validation.value !== undefined) {
        return { archiveAfterDays: validation.value };
      }
    } catch {
      // Błąd odczytu/parsowania - fallback do 10
    }
  }

  return { archiveAfterDays: 10 };
}

/**
 * Zapisuje nowe ustawienia archiwizacji po uprzedniej walidacji
 */
export function updateArchiveSettings(rawVal: unknown): { success: boolean; error?: string; settings?: ArchiveSettings } {
  const validation = validateArchivePeriod(rawVal);
  if (!validation.valid || validation.value === undefined) {
    return {
      success: false,
      error: validation.error || 'Nieprawidłowa wartość okresu archiwizacji.',
    };
  }

  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }

    const newSettings: ArchiveSettings = {
      archiveAfterDays: validation.value,
    };

    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2) + '\n', 'utf8');
      return {
        success: true,
        settings: newSettings,
      };
    } catch (writeErr: any) {
      if (writeErr?.code === 'EROFS' || String(writeErr?.message).includes('read-only')) {
        return {
          success: true,
          readOnly: true,
          settings: newSettings,
        };
      }
      throw writeErr;
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Nie udało się zapisać ustawień: ${err?.message || 'Błąd zapisu pliku'}`,
    };
  }
}
