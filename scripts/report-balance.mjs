import path from 'node:path';
import {
  loadNewsRecords,
  getVenueGroup,
  isWeeklySummaryRecord,
  computeRecentDistribution,
  formatBalanceSummary,
} from './daily-digest.mjs';
import { resolveVenueGroup, toWarsawDate } from './balance.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDaysArg(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--days' && argv[i + 1]) {
      const parsed = parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    } else if (arg.startsWith('--days=')) {
      const parsed = parseInt(arg.split('=')[1], 10);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  return 14;
}

function parseIsoDayUtc(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return NaN;
  const clean = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return NaN;
  return Date.parse(`${clean}T00:00:00Z`);
}

function formatIsoDayUtc(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function pad(val, width, alignRight = false) {
  const str = String(val);
  if (str.length >= width) return str;
  const spaces = ' '.repeat(width - str.length);
  return alignRight ? spaces + str : str + spaces;
}

export function generateBalanceReport(records, { days = 14, now = new Date() } = {}) {
  const todayIso = toWarsawDate(now);
  const todayTs = parseIsoDayUtc(todayIso);
  const startTs = todayTs - (days - 1) * DAY_MS;

  const eligible = records.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (r.aiGenerated !== true) return false;
    if (r.status === 'deleted') return false;
    if (isWeeklySummaryRecord(r)) return false;
    if (!r.addedDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.addedDate)) return false;
    const ts = parseIsoDayUtc(r.addedDate);
    return Number.isFinite(ts) && ts >= startTs && ts <= todayTs;
  });

  const dayMap = new Map();
  for (let d = 0; d < days; d++) {
    const dateIso = formatIsoDayUtc(startTs + d * DAY_MS);
    dayMap.set(dateIso, {
      date: dateIso,
      total: 0,
      ticketed: 0,
      nospr: 0,
      'teatr-slaski': 0,
      'teatr-rozrywki': 0,
      spodek: 0,
      other: 0,
      byCategory: {},
    });
  }

  const allCategoriesSet = new Set([
    'nospr',
    'teatr-slaski',
    'teatr-rozrywki',
    'spodek',
    'kultura',
    'wydarzenia',
    'dla-dzieci',
    'sport',
    'drogi-komunikacja',
    'gastro',
    'alerty',
  ]);

  const totals = {
    total: 0,
    ticketed: 0,
    nospr: 0,
    'teatr-slaski': 0,
    'teatr-rozrywki': 0,
    spodek: 0,
    other: 0,
    byCategory: {},
  };

  for (const r of eligible) {
    const bucket = dayMap.get(r.addedDate);
    if (!bucket) continue;
    const venue = resolveVenueGroup(r);
    const cat = r.category || (venue !== 'other' ? venue : 'wydarzenia');
    allCategoriesSet.add(cat);

    bucket.total += 1;
    bucket[venue] = (bucket[venue] || 0) + 1;
    if (venue !== 'other') bucket.ticketed += 1;
    bucket.byCategory[cat] = (bucket.byCategory[cat] || 0) + 1;

    totals.total += 1;
    totals[venue] = (totals[venue] || 0) + 1;
    if (venue !== 'other') totals.ticketed += 1;
    totals.byCategory[cat] = (totals.byCategory[cat] || 0) + 1;
  }

  const categories = [...allCategoriesSet];
  const lines = [];

  lines.push(`==========================================================================================`);
  lines.push(`📊 RAPORT RÓWNOWAGI TREŚCI AI (ostatnie ${days} dni: ${formatIsoDayUtc(startTs)} .. ${todayIso})`);
  lines.push(`==========================================================================================`);
  lines.push('');
  lines.push('1. ROZKŁAD OBIEKTÓW (venueGroup) PER DZIEŃ:');
  lines.push(
    `${pad('Data', 12)} | ${pad('Razem', 5, true)} | ${pad('Ticketed', 8, true)} | ${pad('Udział %', 8, true)} | ` +
    `${pad('NOSPR', 5, true)} | ${pad('T.Śląski', 8, true)} | ${pad('T.Rozr.', 7, true)} | ${pad('Spodek', 6, true)} | ${pad('Other', 5, true)}`
  );
  lines.push('-'.repeat(90));

  for (const row of dayMap.values()) {
    const shareStr = row.total > 0 ? `${((row.ticketed / row.total) * 100).toFixed(1)}%` : '   - ';
    lines.push(
      `${pad(row.date, 12)} | ${pad(row.total, 5, true)} | ${pad(row.ticketed, 8, true)} | ${pad(shareStr, 8, true)} | ` +
      `${pad(row.nospr, 5, true)} | ${pad(row['teatr-slaski'], 8, true)} | ${pad(row['teatr-rozrywki'], 7, true)} | ${pad(row.spodek, 6, true)} | ${pad(row.other, 5, true)}`
    );
  }

  lines.push('-'.repeat(90));
  const totalShareStr = totals.total > 0 ? `${((totals.ticketed / totals.total) * 100).toFixed(1)}%` : '0.0%';
  lines.push(
    `${pad('SUMA', 12)} | ${pad(totals.total, 5, true)} | ${pad(totals.ticketed, 8, true)} | ${pad(totalShareStr, 8, true)} | ` +
    `${pad(totals.nospr, 5, true)} | ${pad(totals['teatr-slaski'], 8, true)} | ${pad(totals['teatr-rozrywki'], 7, true)} | ${pad(totals.spodek, 6, true)} | ${pad(totals.other, 5, true)}`
  );

  lines.push('');
  lines.push('2. ROZKŁAD KATEGORII (category) PER DZIEŃ:');
  const catHeaders = categories.map((c) => pad(c.slice(0, 8), 8, true)).join(' | ');
  lines.push(`${pad('Data', 12)} | ${pad('Razem', 5, true)} | ${catHeaders}`);
  lines.push('-'.repeat(22 + categories.length * 11));

  for (const row of dayMap.values()) {
    const catCols = categories.map((c) => pad(row.byCategory[c] || 0, 8, true)).join(' | ');
    lines.push(`${pad(row.date, 12)} | ${pad(row.total, 5, true)} | ${catCols}`);
  }

  lines.push('-'.repeat(22 + categories.length * 11));
  const totalCatCols = categories.map((c) => pad(totals.byCategory[c] || 0, 8, true)).join(' | ');
  lines.push(`${pad('SUMA', 12)} | ${pad(totals.total, 5, true)} | ${totalCatCols}`);

  const nosprSharePct = totals.total > 0 ? ((totals.nospr / totals.total) * 100).toFixed(1) : '0.0';
  const ticketedSharePct = totals.total > 0 ? ((totals.ticketed / totals.total) * 100).toFixed(1) : '0.0';

  lines.push('');
  lines.push('3. PODSUMOWANIE OKRESU:');
  lines.push(`- Łącznie artykułów AI (bez zbiorczych i usuniętych): ${totals.total}`);
  lines.push(`- Grupa biletowana (ticketed): ${totals.ticketed}/${totals.total} (${ticketedSharePct}%) [cel D1: 30–40%]`);
  lines.push(`- Udział NOSPR: ${totals.nospr}/${totals.total} (${nosprSharePct}%) [cel D1: 12–20%]`);
  lines.push(`- Obiekty biletowane: NOSPR=${totals.nospr}, Teatr Śląski=${totals['teatr-slaski']}, Teatr Rozrywki=${totals['teatr-rozrywki']}, Spodek=${totals.spodek}`);
  lines.push(`- Pozostałe źródła (other): ${totals.other}`);
  lines.push(`- ${formatBalanceSummary(records, { now })}`);

  return {
    text: lines.join('\n'),
    days,
    todayIso,
    totals,
    dayRows: [...dayMap.values()],
  };
}

function main() {
  const days = parseDaysArg();
  const records = loadNewsRecords();
  const report = generateBalanceReport(records, { days });
  console.log(report.text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  main();
}
