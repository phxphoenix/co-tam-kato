import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const NEWS_DIR = path.join(ROOT_DIR, 'src', 'content', 'news');
const SETTINGS_PATH = path.join(ROOT_DIR, 'src', 'content', 'settings', 'archive.json');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'archive-worker.log');

/**
 * Zwraca aktualny czas i datę w strefie czasowej Europe/Warsaw
 */
export function getWarsawTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find((p) => p.type === type)?.value;

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
  };
}

/**
 * Pobiera aktualną wartość okresu archiwizacji (w dniach, domyślnie 10)
 * 1. Z pliku konfiguracyjnego panelu Keystatic (src/content/settings/archive.json)
 * 2. Ze zmiennej środowiskowej ARCHIVE_AFTER_DAYS
 * 3. Wartość fallback: 10
 */
export function getArchivePeriodDays() {
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (typeof data.archiveAfterDays === 'number' && data.archiveAfterDays > 0) {
        return data.archiveAfterDays;
      }
    } catch (err) {
      console.warn(`[Archive Worker] Ostrzeżenie: Błąd odczytu ${SETTINGS_PATH}: ${err?.message}`);
    }
  }

  if (process.env.ARCHIVE_AFTER_DAYS) {
    const envVal = parseInt(process.env.ARCHIVE_AFTER_DAYS, 10);
    if (!isNaN(envVal) && envVal > 0) {
      return envVal;
    }
  }

  return 10;
}

/**
 * Bezpiecznie zapisuje wpis w logu systemowym
 */
function appendLog(entry) {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    const line = `[${entry.timestamp}] [${entry.level}] ${entry.message}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('[Archive Worker] Błąd zapisu do pliku logu:', err);
  }
}

/**
 * Główna funkcja wykonawcza workera archiwizacji
 */
export async function runArchiveWorker(options = {}) {
  const {
    force = false,
    checkScheduledHour = true,
    targetHour = 2,
    customDays,
    referenceDate = new Date(),
  } = options;

  const warsaw = getWarsawTime(referenceDate);
  const timestamp = `${warsaw.isoDate} ${warsaw.timeStr} (Europe/Warsaw)`;

  console.log(`\n======================================================`);
  console.log(`📦 Co Tam KATO: Nocny Worker Archiwizacji`);
  console.log(`⏰ Czas uruchomienia: ${timestamp}`);
  console.log(`======================================================`);

  // Kryterium: Sprawdzenie godziny 02:00 czasu polskiego przy uruchomieniu z crona
  if (checkScheduledHour && !force) {
    if (warsaw.hour !== targetHour) {
      const msg = `Pominięto wykonanie: w strefie Europe/Warsaw jest godzina ${warsaw.hour}:${String(warsaw.minute).padStart(2, '0')}. Worker jest zaplanowany na godzinę ${String(targetHour).padStart(2, '0')}:00 czasu lokalnego.`;
      console.log(`ℹ️ ${msg}`);
      appendLog({ timestamp, level: 'INFO', message: msg });
      return {
        executed: false,
        reason: 'outside_scheduled_hour',
        currentHour: warsaw.hour,
        targetHour,
      };
    }
  }

  const archiveAfterDays = customDays || getArchivePeriodDays();
  console.log(`⚙️ Konfiguracja: Archiwizacja artykułów starszych niż ${archiveAfterDays} dni (> ${archiveAfterDays} d).`);

  if (!fs.existsSync(NEWS_DIR)) {
    const errorMsg = `Katalog artykułów ${NEWS_DIR} nie istnieje!`;
    console.error(`❌ ${errorMsg}`);
    appendLog({ timestamp, level: 'ERROR', message: errorMsg });
    return { executed: false, error: errorMsg };
  }

  const files = fs.readdirSync(NEWS_DIR).filter((f) => /\.(md|mdx)$/i.test(f));
  const referenceTimestamp = new Date(warsaw.isoDate + 'T00:00:00Z').getTime();

  let totalScanned = 0;
  let archivedCount = 0;
  let alreadyArchivedCount = 0;
  let protectedByOverrideCount = 0;
  let errorsCount = 0;
  const archivedArticles = [];

  for (const file of files) {
    totalScanned++;
    const filePath = path.join(NEWS_DIR, file);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/);
      if (!match) continue;

      const frontmatterRaw = match[1];
      const body = match[2];

      const readField = (name) => {
        const regex = new RegExp(`^${name}\\s*:\\s*(.*)$`, 'm');
        const m = frontmatterRaw.match(regex);
        if (!m) return undefined;
        let val = m[1].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        return val;
      };

      const title = readField('title') || file;
      const pubDateStr = readField('sourceDate') || readField('pubDate');
      const isArchived = readField('archived') === 'true';
      const isManualOverride = readField('manualOverride') === 'true';
      const status = readField('status') || 'published';

      if (status === 'deleted') continue;

      if (isArchived) {
        alreadyArchivedCount++;
        continue;
      }

      if (isManualOverride) {
        protectedByOverrideCount++;
        console.log(`🛡️ Pominięto artykuł z flagą ManualOverride: „${title}” (${file})`);
        continue;
      }

      if (!pubDateStr) continue;

      const articleDate = new Date(pubDateStr.slice(0, 10) + 'T00:00:00Z');
      const diffMs = referenceTimestamp - articleDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Kryterium: Różnica między bieżącą datą a datą publikacji jest ŚCIŚLE WIĘKSZA niż skonfigurowana liczba dni (> archiveAfterDays)
      if (diffDays > archiveAfterDays) {
        let updatedFrontmatter = frontmatterRaw;
        if (/^archived\s*:/m.test(updatedFrontmatter)) {
          updatedFrontmatter = updatedFrontmatter.replace(/^archived\s*:.*$/m, 'archived: true');
        } else {
          updatedFrontmatter += '\narchived: true';
        }

        const newContent = `---\n${updatedFrontmatter.trim()}\n---${body}`;
        fs.writeFileSync(filePath, newContent, 'utf8');

        archivedCount++;
        archivedArticles.push({
          file,
          title,
          pubDate: pubDateStr,
          diffDays,
        });

        console.log(`📥 Zarchiwizowano: [${diffDays} dni temu] „${title}” (${file})`);
      }
    } catch (err) {
      errorsCount++;
      const msg = `Błąd przetwarzania pliku ${file}: ${err?.message}`;
      console.error(`❌ ${msg}`);
      appendLog({ timestamp, level: 'ERROR', message: msg });
    }
  }

  const summary = `Zakończono proces: Przeskanowano: ${totalScanned}, Nowo zarchiwizowane: ${archivedCount}, Już w archiwum: ${alreadyArchivedCount}, Ochrona ManualOverride: ${protectedByOverrideCount}, Błędy: ${errorsCount}.`;
  console.log(`\n📊 ${summary}`);
  console.log(`======================================================\n`);

  appendLog({
    timestamp,
    level: errorsCount > 0 ? 'WARN' : 'INFO',
    message: summary,
  });

  return {
    executed: true,
    timestamp,
    archiveAfterDays,
    totalScanned,
    archivedCount,
    alreadyArchivedCount,
    protectedByOverrideCount,
    errorsCount,
    archivedArticles,
  };
}

// Obsługa uruchomienia bezpośredniego z linii poleceń
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  const isScheduled = process.argv.includes('--scheduled');
  const force = process.argv.includes('--force') || !isScheduled;

  runArchiveWorker({
    force,
    checkScheduledHour: isScheduled,
  })
    .then((result) => {
      if (result.errorsCount && result.errorsCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('Krytyczny błąd workera:', err);
      process.exitCode = 1;
    });
}
