import path from 'node:path';
import {
  DEFAULT_BALANCE_SETTINGS,
  validateBalanceSettings,
  parseBalanceSettings,
} from './sources-parser.mjs';

export {
  DEFAULT_BALANCE_SETTINGS,
  validateBalanceSettings,
  parseBalanceSettings,
};

export const MAX_ARTICLES = 4;
export const MAX_CANDIDATES = DEFAULT_BALANCE_SETTINGS.maxCandidates;

export const TICKETED_VENUE_GROUPS = [
  'nospr',
  'teatr-slaski',
  'teatr-rozrywki',
  'spodek',
];

export const HIGH_PRIORITY_SOURCE_IDS = new Set(['7', '30', '5', '10', '11']);
export const TICKETED_SOURCE_IDS = HIGH_PRIORITY_SOURCE_IDS;

const TICKETED_VENUE_SET = new Set(TICKETED_VENUE_GROUPS);
const DAY_MS = 24 * 60 * 60 * 1000;

const IGNORED_CYCLE_LABELS = new Set([
  'nospr',
  'nospr katowice',
  'spodek',
  'spodek katowice',
  'teatr slaski',
  'teatr slaski w katowicach',
  'teatr rozrywki',
  'teatr rozrywki w chorzowie',
  'mck',
  'mck katowice',
  'katowice',
  'chorzow',
  'duza scena',
  'mala scena',
  'scena kameralna',
  'scena w malarni',
  'scena pod dachem',
  'scena 200',
  'sala koncertowa',
  'sala kameralna',
  'moj karnet',
  'koncert',
  'koncerty',
  'spektakl',
  'spektakle',
  'wydarzenie',
  'wydarzenia',
  'wydarzenie w nospr',
  'spektakl w teatrze slaskim',
  'aktualnosc nospr katowice',
  'premiera',
  'prapremiera',
  'repertuar',
  'kalendarz',
]);

/**
 * Klasyfikuje artykuł lub element źródłowy do grupy obiektu widowiskowego (§1 specyfikacji).
 * Kolejność reguł (pierwsza pasująca wygrywa): nospr -> spodek -> teatr-rozrywki -> teatr-slaski -> other.
 */
export function getVenueGroup(articleOrItem) {
  if (!articleOrItem || typeof articleOrItem !== 'object') return 'other';

  const url = String(articleOrItem.sourceUrl || articleOrItem.link || '').toLowerCase();
  const loc = String(articleOrItem.location || '').toLowerCase();
  const srcName = String(articleOrItem.sourceName || '').toLowerCase();

  if (url.includes('nospr.org.pl') || loc.includes('nospr') || srcName.includes('nospr')) {
    return 'nospr';
  }
  if (url.includes('spodekkatowice.pl') || loc.includes('spodek') || srcName.includes('spodek')) {
    return 'spodek';
  }
  if (url.includes('teatr-rozrywki.pl') || loc.includes('teatr rozrywki') || srcName.includes('teatr rozrywki')) {
    return 'teatr-rozrywki';
  }
  if (
    url.includes('teatrslaski.art.pl') ||
    loc.includes('teatr śląski') ||
    loc.includes('teatr slaski') ||
    srcName.includes('teatr śląski') ||
    srcName.includes('teatr slaski')
  ) {
    return 'teatr-slaski';
  }

  return 'other';
}

/**
 * Pomocnicza funkcja wyznaczająca venueGroup z uwzględnieniem jawnego pola venueGroup
 * lub kategorii obiektu biletowanego (przydatne dla skróconych rekordów testowych).
 */
export function resolveVenueGroup(articleOrItem, sourceItem = null) {
  if (!articleOrItem || typeof articleOrItem !== 'object') return 'other';

  if (
    typeof articleOrItem.venueGroup === 'string' &&
    (TICKETED_VENUE_SET.has(articleOrItem.venueGroup) || articleOrItem.venueGroup === 'other')
  ) {
    return articleOrItem.venueGroup;
  }

  const combined = sourceItem
    ? {
        sourceUrl: articleOrItem.sourceUrl || articleOrItem.link || sourceItem.link || sourceItem.sourceUrl,
        location: articleOrItem.location || sourceItem.location,
        sourceName: sourceItem.sourceName || articleOrItem.sourceName,
      }
    : articleOrItem;

  const detected = getVenueGroup(combined);
  if (detected !== 'other') return detected;

  if (typeof articleOrItem.category === 'string' && TICKETED_VENUE_SET.has(articleOrItem.category)) {
    return articleOrItem.category;
  }

  return 'other';
}

/**
 * Sprawdza przynależność pozycji lub źródła do grupy obiektów biletowanych (§5.2: NOSPR, Spodek, Teatr Śląski, Teatr Rozrywki).
 */
export function isTicketedVenueItem(itemOrSource) {
  if (!itemOrSource || typeof itemOrSource !== 'object') return false;
  const id = String(itemOrSource.sourceId ?? itemOrSource.id ?? '').trim();
  if (HIGH_PRIORITY_SOURCE_IDS.has(id)) return true;

  const venue = resolveVenueGroup({
    venueGroup: itemOrSource.venueGroup,
    category: itemOrSource.category,
    sourceUrl: itemOrSource.link ?? itemOrSource.url ?? itemOrSource.sourceUrl,
    location: itemOrSource.location,
    sourceName: itemOrSource.sourceName ?? itemOrSource.name,
  });
  return venue !== 'other';
}

/**
 * Sprawdza, czy pozycja z grupy biletowanej jest wyjątkowa i zasługuje na highPriority: true (§5.2):
 * - status biletów zawiera „Ostatnie bilety” lub „Ostatnie wolne miejsca”, LUB
 * - tytuł/opis zawiera słowa kluczowe: premiera, prapremiera, start sprzedaży, ruszyła sprzedaż, sylwester, gala, festiwal, nowy sezon, LUB
 * - pozycja pochodzi z NOSPR – Aktualności (ID 30) i dotyczy sprzedaży biletów / sezonu.
 */
export function isHighPriorityItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!isTicketedVenueItem(item)) return false;

  const statusText = `${item.ticketStatus || ''} ${item.description || ''}`;
  if (/ostatnie\s+(?:bilety|wolne\s+miejsca)/i.test(statusText)) {
    return true;
  }

  const text = `${item.title || ''} ${item.description || ''}`;
  if (
    /\b(?:pra)?premier(?:a|y|ze|ę|ą|o|ach|ami|om|owy|owa|owe)\b/i.test(text) ||
    /\bstart(?:uje|ował)?\s+sprzeda[żz][yi]?\b/i.test(text) ||
    /\brusz(?:y[łl]a|a|ają)\s+sprzeda[żz]\b/i.test(text) ||
    /\bsylwest(?:er|ra|row[aey]|rowym|rowe)\b/i.test(text) ||
    /\bgal(?:a|i|ę|ą|o|owy|owa|owe)\b/i.test(text) ||
    /\bfestiwal(?:u|em|owi|e|i|owy|owa|owe)?\b/i.test(text) ||
    /\bnow(?:y|ego|ym|e)\s+sezon(?:u|ie|em)?\b/i.test(text)
  ) {
    return true;
  }

  const id = String(item.sourceId ?? item.id ?? '').trim();
  const url = String(item.link ?? item.url ?? item.sourceUrl ?? '').toLowerCase();
  const srcName = String(item.sourceName ?? item.name ?? '').toLowerCase();
  const isNosprAktualnosci =
    id === '30' ||
    url.includes('nospr.org.pl/pl/aktualnosci') ||
    (srcName.includes('nospr') && srcName.includes('aktualno'));

  if (
    isNosprAktualnosci &&
    /(?:sprzeda[żz]|bilet|karnet|abonament|sezon|repertuar|program|cykl)/i.test(text)
  ) {
    return true;
  }

  return false;
}

/**
 * Normalizuje nazwę cyklu do porównań (małe litery, bez diakrytyków).
 */
export function normalizeCycleKey(value = '') {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanCycleLabel(raw = '') {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw
    .trim()
    .replace(/^[„”"'«»(\[\s]+|[„”"'«»)\]\s]+$/g, '')
    .replace(/^(?:w\s+ramach\s+(?:uznanego\s+|popularnego\s+)?cyklu|cykl\s+koncert[oó]w|cykl)\s+/i, '')
    .replace(/\s+w\s+(?:katowickiej\s+|katowickim\s+)?(?:nospr|katowicach|teatrze\s+[śs]l[ąa]skim|teatrze\s+rozrywki|chorzowie|spodku)$/i, '')
    .replace(/^[„”"'«»\s]+|[„”"'«»\s]+$/g, '')
    .trim();

  if (!cleaned) return null;
  const norm = normalizeCycleKey(cleaned);
  if (!norm || norm.length < 3 || norm.length > 42) return null;
  if (IGNORED_CYCLE_LABELS.has(norm)) return null;
  if (/^(?:https?|202\d)\b/.test(norm)) return null;
  return cleaned;
}

/**
 * Wyciąga nazwę cyklu (§5.3 pkt 4) z opisu parsera („Cykl/kategoria: ...”, „Cykl/scena: ...”),
 * jawnego pola cycle/cycleName, prefiksu tytułu przed „:” / „/” lub frazy „w ramach cyklu ...”.
 */
export function extractCycleName(itemOrArticle) {
  if (!itemOrArticle || typeof itemOrArticle !== 'object') return null;

  const explicit = itemOrArticle.cycle || itemOrArticle.cycleName;
  if (typeof explicit === 'string' && explicit.trim()) {
    const cleaned = cleanCycleLabel(explicit);
    if (cleaned) return cleaned;
  }

  if (Array.isArray(itemOrArticle.categories) && itemOrArticle.categories.length > 0) {
    for (const c of itemOrArticle.categories) {
      const cleaned = cleanCycleLabel(c);
      if (cleaned) return cleaned;
    }
  }

  const desc = String(itemOrArticle.description || '');
  const descMatch = desc.match(/Cykl\/(?:kategoria|scena):\s*([^.]+)\./i);
  if (descMatch && descMatch[1]) {
    const parts = descMatch[1].split(/\s*(?:\/|,)\s*/);
    for (const part of parts) {
      const cleaned = cleanCycleLabel(part);
      if (cleaned) return cleaned;
    }
  }

  const title = String(itemOrArticle.title || '').trim();
  if (title) {
    const prefixMatch = title.match(/^([^:/]{3,45}?)\s*[:/]\s+(.+)$/);
    if (prefixMatch && prefixMatch[1]) {
      const cleaned = cleanCycleLabel(prefixMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  const bodyText = `${itemOrArticle.summary || ''} ${itemOrArticle.description || ''} ${itemOrArticle.content || ''}`;
  const inTextMatch = bodyText.match(
    /\bw\s+ramach\s+(?:uznanego\s+|popularnego\s+)?cyklu\s+[„"]([^”"]{3,40})[”"]|\bw\s+ramach\s+(?:uznanego\s+|popularnego\s+)?cyklu\s+([A-ZĄĆĘŁŃÓŚŹŻ][A-Za-ząćęłńóśźż0-9-]*(?:\s+[A-Za-ząćęłńóśźż0-9-]+){0,2}?)(?=[,.;]|\s+(?:w|na|już|katowick|odbędzie|wystąpi|zaprasza|zagra)\b|$)/
  );
  if (inTextMatch) {
    const candidate = inTextMatch[1] || inTextMatch[2];
    const cleaned = cleanCycleLabel(candidate);
    if (cleaned) return cleaned;
  }

  return null;
}

/**
 * Zwraca datę YYYY-MM-DD w strefie Europe/Warsaw.
 */
export function toWarsawDate(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(parsed);
}

function parseIsoDayUtc(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return NaN;
  const clean = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return NaN;
  return Date.parse(`${clean}T00:00:00Z`);
}

function extractAddedDate(record) {
  if (!record || typeof record !== 'object') return '';
  if (typeof record.addedDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(record.addedDate.trim())) {
    return record.addedDate.trim().slice(0, 10);
  }
  const candidates = [record.file, record.slug, record.filePath ? path.basename(record.filePath) : ''];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const m = c.trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
      if (m) return m[1];
    }
  }
  return '';
}

/**
 * Sprawdza, czy rekord jest wpisem zbiorczym „Tydzień w kulturze” (§1 i §6 specyfikacji).
 * Rozpoznaje po obecności 'tydzien-w-kulturze' w slugu / nazwie pliku (lub tytule).
 */
export function isWeeklySummaryRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const rawSlug = String(record.slug || record.file || record.filePath || '').toLowerCase();
  if (rawSlug.includes('tydzien-w-kulturze')) return true;

  if (typeof record.title === 'string' && record.title.trim()) {
    const normalizedTitleSlug = record.title
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (ch) => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }[ch] || ch))
      .replace(/[^a-z0-9]+/g, '-');
    if (normalizedTitleSlug.includes('tydzien-w-kulturze')) return true;
  }

  return false;
}

function createEmptyPeriodStats() {
  return {
    total: 0,
    ticketed: 0,
    nospr: 0,
    'teatr-slaski': 0,
    'teatr-rozrywki': 0,
    spodek: 0,
    other: 0,
    share: 0,
    byVenueGroup: {
      nospr: 0,
      'teatr-slaski': 0,
      'teatr-rozrywki': 0,
      spodek: 0,
      other: 0,
    },
    byCategory: {},
  };
}

function addRecordToPeriodStats(bucket, venue, category) {
  bucket.total += 1;
  bucket[venue] = (bucket[venue] || 0) + 1;
  bucket.byVenueGroup[venue] = (bucket.byVenueGroup[venue] || 0) + 1;
  if (venue !== 'other') {
    bucket.ticketed += 1;
  }
  if (category) {
    bucket.byCategory[category] = (bucket.byCategory[category] || 0) + 1;
  }
  bucket.share = bucket.total > 0 ? bucket.ticketed / bucket.total : 0;
}

/**
 * Oblicza rozkład artykułów per venueGroup i per category dla: dziś, 3 dni (dziś + 2 poprz.) i 7 dni (dziś + 6 poprz.).
 * Uwzględnia wyłącznie wpisy z aiGenerated: true, status !== 'deleted', bez wpisów zbiorczych (§1).
 */
export function computeRecentDistribution(records = [], options = {}) {
  const rawNow =
    options instanceof Date || typeof options === 'string' || typeof options === 'number'
      ? options
      : options?.now ?? new Date();

  const todayIso = toWarsawDate(rawNow);
  const todayTs = parseIsoDayUtc(todayIso);

  const today = createEmptyPeriodStats();
  const last3d = createEmptyPeriodStats();
  const last7d = createEmptyPeriodStats();

  if (!Array.isArray(records)) {
    return {
      todayIso,
      today,
      last3d,
      last7d,
      byCategoryToday: today.byCategory,
      byCategory3d: last3d.byCategory,
      byCategory7d: last7d.byCategory,
    };
  }

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (record.aiGenerated !== true) continue;
    if (record.status === 'deleted') continue;
    if (isWeeklySummaryRecord(record)) continue;

    const addedDate = extractAddedDate(record);
    if (!addedDate) continue;

    const recTs = parseIsoDayUtc(addedDate);
    if (!Number.isFinite(recTs) || !Number.isFinite(todayTs)) continue;

    const diffDays = Math.round((todayTs - recTs) / DAY_MS);
    if (diffDays < 0 || diffDays > 6) continue;

    const venue = resolveVenueGroup(record);
    const category = record.category || (venue !== 'other' ? venue : '');

    if (diffDays === 0) {
      addRecordToPeriodStats(today, venue, category);
    }
    if (diffDays <= 2) {
      addRecordToPeriodStats(last3d, venue, category);
    }
    if (diffDays <= 6) {
      addRecordToPeriodStats(last7d, venue, category);
    }
  }

  return {
    todayIso,
    today,
    last3d,
    last7d,
    byCategoryToday: today.byCategory,
    byCategory3d: last3d.byCategory,
    byCategory7d: last7d.byCategory,
  };
}

/**
 * Sprawdza, czy kandydat jest pilny (urgent) wg §1:
 * - należy do grupy biletowanej (nospr, teatr-slaski, teatr-rozrywki, spodek),
 * - posiada status „Ostatnie bilety” / „Ostatnie wolne miejsca”,
 * - ma eventDate w ciągu <= 14 dni od bieżącej daty (Europe/Warsaw).
 */
export function isUrgentCandidate(article, sourceItem = null, now = new Date()) {
  if (!article || typeof article !== 'object') return false;

  const venue = resolveVenueGroup(article, sourceItem);
  if (venue === 'other') return false;

  const combinedStatusText = [
    article.ticketStatus,
    sourceItem?.ticketStatus,
    sourceItem?.description,
    article.description,
    article.summary,
    article.content,
  ]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ');

  const hasLastTicketsStatus = /ostatnie\s+(?:bilety|wolne\s+miejsca)/i.test(combinedStatusText);
  if (!hasLastTicketsStatus) return false;

  const rawEventDate = article.eventDate || sourceItem?.eventDate;
  if (!rawEventDate || typeof rawEventDate !== 'string') return false;
  const cleanEventDate = rawEventDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanEventDate)) return false;

  const todayIso = toWarsawDate(now);
  const todayTs = parseIsoDayUtc(todayIso);
  const eventTs = parseIsoDayUtc(cleanEventDate);
  if (!Number.isFinite(todayTs) || !Number.isFinite(eventTs)) return false;

  const diffDays = Math.round((eventTs - todayTs) / DAY_MS);
  return diffDays >= 0 && diffDays <= 14;
}

function resolveEffectiveSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_BALANCE_SETTINGS };
  }
  return validateBalanceSettings({ ...DEFAULT_BALANCE_SETTINGS, ...settings });
}

/**
 * Wylicza budżet równowagi kategorii dokładnie wg §3 specyfikacji.
 */
export function computeBalanceBudget(existingArticles = [], settings = DEFAULT_BALANCE_SETTINGS, now = new Date()) {
  const s = resolveEffectiveSettings(settings);
  const dist = computeRecentDistribution(existingArticles, { now });
  const { today, last3d, last7d } = dist;

  // 1. today = liczniki per venueGroup dla artykułów z prefiksem pliku = dzisiejsza data.
  // 2. share3d = ticketed / wszystkie z ostatnich 3 dni (gdy wszystkich < 4, ignoruj próg udziału).
  const share3d = last3d.total > 0 ? last3d.ticketed / last3d.total : 0;
  const isShareExceeded = last3d.total >= 4 && share3d > s.ticketedMaxShare3d;

  // 3. ticketedAllowed = min(ticketedMaxPerRun, ticketedMaxPerDay - today.ticketed), nie mniej niż 0.
  let ticketedAllowed = Math.max(0, Math.min(s.ticketedMaxPerRun, s.ticketedMaxPerDay - today.ticketed));

  // 4. Jeśli share3d > ticketedMaxShare3d i today.ticketed >= 1, to ticketedAllowed = 0.
  if (isShareExceeded && today.ticketed >= 1) {
    ticketedAllowed = 0;
  }

  // 5. floorRequired = today.ticketed < ticketedMinPerDay. Wtedy ticketedAllowed = max(ticketedAllowed, 1).
  const floorRequired = s.ticketedMinPerDay > 0 && today.ticketed < s.ticketedMinPerDay;
  if (floorRequired) {
    ticketedAllowed = Math.max(ticketedAllowed, 1);
  }

  // 6. nosprAllowed = min(nosprMaxPerRun, nosprMaxPerDay - today.nospr, ticketedAllowed).
  const nosprAllowed = Math.max(
    0,
    Math.min(s.nosprMaxPerRun, s.nosprMaxPerDay - today.nospr, ticketedAllowed)
  );

  // 7. perVenueAllowed[v] = min(otherVenueMaxPerDay - today[v], ticketedAllowed).
  const perVenueAllowed = {
    'teatr-slaski': Math.max(0, Math.min(s.otherVenueMaxPerDay - today['teatr-slaski'], ticketedAllowed)),
    'teatr-rozrywki': Math.max(0, Math.min(s.otherVenueMaxPerDay - today['teatr-rozrywki'], ticketedAllowed)),
    spodek: Math.max(0, Math.min(s.otherVenueMaxPerDay - today.spodek, ticketedAllowed)),
  };

  // 8. urgentBonusAvailable = lastTicketsBonusPerDay - (dzisiejsze wpisy użyte jako bonus).
  // Wpisy bonusowe rozpoznawane są po tym, że przekroczyły limit: today.ticketed - ticketedMaxPerDay jeśli > 0.
  const usedBonusToday = Math.max(0, today.ticketed - s.ticketedMaxPerDay);
  const urgentBonusAvailable = Math.max(0, s.lastTicketsBonusPerDay - usedBonusToday);

  return {
    ticketedAllowed,
    nosprAllowed,
    perVenueAllowed,
    floorRequired,
    urgentBonusAvailable,
    stats: {
      today,
      last3d: {
        ...last3d,
        share: share3d,
      },
      last7d,
      byCategoryToday: dist.byCategoryToday,
      byCategory3d: dist.byCategory3d,
      byCategory7d: dist.byCategory7d,
    },
  };
}

function findMatchingSourceItem(article, sourceItems = []) {
  if (!article || !Array.isArray(sourceItems) || sourceItems.length === 0) return null;
  const rawUrl = String(article.sourceUrl || article.link || '').trim();
  if (!rawUrl) return null;

  const lowerUrl = rawUrl.toLowerCase().replace(/\/+$/, '');
  const exact = sourceItems.find(
    (item) =>
      item &&
      !item.isDiscoveredLinkOnly &&
      String(item.link || '').trim().toLowerCase().replace(/\/+$/, '') === lowerUrl
  );
  if (exact) return exact;

  return (
    sourceItems.find(
      (item) => item && String(item.link || '').trim().toLowerCase().replace(/\/+$/, '') === lowerUrl
    ) || null
  );
}

/**
 * Wybiera finalne artykuły do publikacji zgodnie z budżetem równowagi (§4 specyfikacji).
 *
 * @param {Array<object>} rankedCandidates Kandydaci w kolejności ważności
 * @param {object} budget Wynik computeBalanceBudget
 * @param {object} [settings] Ustawienia równowagi
 * @param {object} [options] { sourceItems, now, maxArticles }
 * @returns {{ accepted: Array<object>, rejected: Array<{ article: object, reason: string }> }}
 */
export function selectBalancedArticles(
  rankedCandidates = [],
  budget,
  settings = DEFAULT_BALANCE_SETTINGS,
  options = {}
) {
  const s = resolveEffectiveSettings(settings);
  const {
    sourceItems = [],
    now = new Date(),
    maxArticles = MAX_ARTICLES,
  } = options;

  const effectiveBudget = budget || computeBalanceBudget([], s, now);

  let remTicketed = Math.max(0, Number(effectiveBudget.ticketedAllowed ?? 0));
  let remBonus = Math.max(0, Number(effectiveBudget.urgentBonusAvailable ?? 0));
  const remVenue = {
    nospr: Math.max(0, Number(effectiveBudget.nosprAllowed ?? 0)),
    'teatr-slaski': Math.max(0, Number(effectiveBudget.perVenueAllowed?.['teatr-slaski'] ?? 0)),
    'teatr-rozrywki': Math.max(0, Number(effectiveBudget.perVenueAllowed?.['teatr-rozrywki'] ?? 0)),
    spodek: Math.max(0, Number(effectiveBudget.perVenueAllowed?.spodek ?? 0)),
  };

  const acceptedEntries = [];
  const rejected = [];

  const decoratedCandidates = rankedCandidates.map((article, index) => {
    const sourceItem = findMatchingSourceItem(article, sourceItems);
    const venue = resolveVenueGroup(article, sourceItem);
    const isUrgent = isUrgentCandidate(article, sourceItem, now);
    return { article, sourceItem, venue, isUrgent, index };
  });

  for (const entry of decoratedCandidates) {
    const { article, venue, isUrgent } = entry;

    if (acceptedEntries.length >= maxArticles) {
      const reason =
        venue !== 'other' && (remTicketed <= 0 || (remVenue[venue] ?? 0) <= 0)
          ? `limit równowagi: ${venue}`
          : `limit publikacji (${maxArticles})`;
      rejected.push({ article, reason });
      console.log(`⚖️ Pominięto (${reason}): ${article.title}`);
      continue;
    }

    if (venue === 'other') {
      acceptedEntries.push(entry);
      console.log(`⚖️ Równowaga: przyjęto [other] ${article.title}`);
      continue;
    }

    const venueAllowed = remVenue[venue] ?? 0;
    if (remTicketed > 0 && venueAllowed > 0) {
      remTicketed -= 1;
      remVenue[venue] = venueAllowed - 1;
      acceptedEntries.push(entry);
      console.log(`⚖️ Równowaga: przyjęto [${venue}] ${article.title}`);
      continue;
    }

    if (isUrgent && remBonus > 0) {
      remBonus -= 1;
      if (remVenue[venue] > 0) remVenue[venue] -= 1;
      acceptedEntries.push(entry);
      console.log(`⚖️ Równowaga: przyjęto [${venue}] (bonus: ostatnie bilety) ${article.title}`);
      continue;
    }

    const limitDetail =
      venueAllowed <= 0
        ? `limit równowagi: ${venue}`
        : `limit równowagi: ${venue} (limit grupy biletowanej)`;
    rejected.push({ article, reason: limitDetail });
    console.log(`⚖️ Pominięto (${limitDetail}): ${article.title}`);
  }

  // Minimum (§4): jeśli floorRequired i nie zaakceptowano żadnego ticketed,
  // a istnieje ticketed kandydat (najlepiej urgent, potem pierwszy w rankingu),
  // to zamień ostatni zaakceptowany other na tego kandydata (albo dodaj, jeśli < 4).
  const hasAcceptedTicketed = acceptedEntries.some((e) => e.venue !== 'other');
  if (effectiveBudget.floorRequired && !hasAcceptedTicketed) {
    const remainingTicketed = decoratedCandidates.filter(
      (e) => e.venue !== 'other' && !acceptedEntries.includes(e)
    );

    if (remainingTicketed.length > 0) {
      const urgentCandidate = remainingTicketed.find((e) => e.isUrgent);
      const chosen = urgentCandidate || remainingTicketed[0];

      // Usuń wybranego kandydata z listy odrzuconych
      const rejIdx = rejected.findIndex((r) => r.article === chosen.article);
      if (rejIdx !== -1) {
        rejected.splice(rejIdx, 1);
      }

      if (acceptedEntries.length < maxArticles) {
        acceptedEntries.push(chosen);
        console.log(`⚖️ Równowaga: przyjęto [${chosen.venue}] (minimum dzienne) ${chosen.article.title}`);
      } else {
        // Zamień ostatni zaakceptowany other na tego kandydata
        let lastOtherIdx = -1;
        for (let i = acceptedEntries.length - 1; i >= 0; i--) {
          if (acceptedEntries[i].venue === 'other') {
            lastOtherIdx = i;
            break;
          }
        }
        if (lastOtherIdx !== -1) {
          const [replaced] = acceptedEntries.splice(lastOtherIdx, 1, chosen);
          rejected.push({
            article: replaced.article,
            reason: 'zamiana na minimum grupy biletowanej (floorRequired)',
          });
          console.log(
            `⚖️ Równowaga: minimum dzienne – zamieniono [other] "${replaced.article.title}" na [${chosen.venue}] "${chosen.article.title}"`
          );
        }
      }
    }
  }

  return {
    accepted: acceptedEntries.map((e) => e.article),
    rejected,
  };
}

/**
 * Formatuje jednowierszowe podsumowanie rozkładu równowagi (§8).
 */
export function formatBalanceSummary(records = [], options = {}) {
  const dist = computeRecentDistribution(records, options);
  const { today, last3d } = dist;
  const share3dPct = last3d.total > 0 ? Math.round((last3d.ticketed / last3d.total) * 100) : 0;
  const nospr3dPct = last3d.total > 0 ? Math.round((last3d.nospr / last3d.total) * 100) : 0;

  return (
    `📊 Rozkład dziś (${dist.todayIso}): ${today.total} wpisów ` +
    `(ticketed=${today.ticketed}: nospr=${today.nospr}, teatr-slaski=${today['teatr-slaski']}, ` +
    `teatr-rozrywki=${today['teatr-rozrywki']}, spodek=${today.spodek}; other=${today.other}); ` +
    `3 dni: ticketed ${last3d.ticketed}/${last3d.total} (${share3dPct}%); ` +
    `NOSPR ${last3d.nospr}/${last3d.total} (${nospr3dPct}%)`
  );
}
