import assert from 'node:assert/strict';
import { loadActiveSources } from './sources-parser.mjs';

const BOT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CoTamKato-Bot/1.0';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripHtml(value = '') {
  return decodeXml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseRssXml(xmlText) {
  return [...xmlText.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(([, , raw]) => {
    const read = (tag) => {
      const match = raw.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? decodeXml(match[1].trim()) : '';
    };
    const linkTag = raw.match(/<link\b([^>]*)>([\s\S]*?)<\/link>|<link\b([^>]*)\/>/i);
    const link = linkTag
      ? ((linkTag[1] || linkTag[3] || '').match(/href=["']([^"']+)/i)?.[1] || linkTag[2] || '').trim()
      : '';
    return {
      title: stripHtml(read('title')),
      link: decodeXml(link),
      description: stripHtml(read('description') || read('summary') || read('content') || read('content:encoded')),
      pubDate: read('pubDate') || read('published') || read('updated'),
    };
  }).filter((item) => item.title && item.link);
}

function cleanHtmlToMarkdown(html, baseUrl) {
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const discoveredLinks = new Map();

  cleaned = cleaned.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, label) => {
    const cleanLabel = stripHtml(label);
    if (!cleanLabel || href.startsWith('#') || href.startsWith('javascript:')) return cleanLabel;
    try {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      if (cleanLabel.length >= 3 && !discoveredLinks.has(fullUrl)) {
        discoveredLinks.set(fullUrl, cleanLabel);
      }
      return ` [${cleanLabel}](${fullUrl}) `;
    } catch {
      return cleanLabel;
    }
  });

  cleaned = cleaned.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, lvl, content) => {
    const text = stripHtml(content);
    return text ? `\n\n### ${text}\n` : '';
  });

  cleaned = cleaned.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (m, content) => {
    const text = stripHtml(content);
    return text ? `\n- ${text}` : '';
  });

  cleaned = cleaned.replace(/<(?:br|hr)\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/(?:p|div|section|article|tr|table)>/gi, '\n');
  cleaned = stripHtml(cleaned);

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return {
    content: lines.join('\n').slice(0, 3000),
    links: Array.from(discoveredLinks.keys()),
  };
}

async function run() {
  console.log('--- TESTOWE POBIERANIE: 1 ŹRÓDŁO RSS + 1 ŹRÓDŁO WEB Z CONFIG/SOURCES.MD ---\n');

  const activeSources = loadActiveSources();

  // Wybierz 1 źródło RSS oraz 1 źródło WEB z nowej tabeli
  const rssSource = activeSources.find((s) => s.type === 'RSS');
  const webSource = activeSources.find((s) => s.type === 'WEB' && s.id === '1'); // PIK Katowice (Główne)

  assert.ok(rssSource, 'Musi istnieć przynajmniej jedno aktywne źródło RSS w config/sources.md');
  assert.ok(webSource, 'Musi istnieć przynajmniej jedno aktywne źródło WEB w config/sources.md');

  // 1. TEST POBIERANIA RSS
  console.log(`📡 [TEST 1: RSS] Pobieranie: [ID ${rssSource.id}] ${rssSource.name}`);
  console.log(`   URL: ${rssSource.url}`);
  console.log(`   Kategoria: ${rssSource.category}`);
  console.log(`   Wskazówki parsowania: "${rssSource.hints}"`);

  const rssRes = await fetch(rssSource.url, {
    headers: { 'User-Agent': BOT_USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(rssRes.status, 200, `Odpowiedź RSS musi mieć status 200 (jest ${rssRes.status})`);
  const rssText = await rssRes.text();
  const rssItems = parseRssXml(rssText);
  assert.ok(rssItems.length > 0, 'Kanał RSS musi zawierać wpisy');

  console.log(`   ✅ Pobrano pomyślnie! Liczba wpisów: ${rssItems.length}`);
  console.log(`   Przykładowy wpis RSS przekazywany do AI:`);
  console.log(`     - Tytuł: ${rssItems[0].title}`);
  console.log(`     - Link: ${rssItems[0].link}`);
  console.log(`     - pubDate (data artykułu): ${rssItems[0].pubDate}`);
  console.log(`     - Opis (skrót): ${rssItems[0].description.slice(0, 150)}...`);
  console.log(`     - Wskazówki parsowania dla AI: ${rssSource.hints}`);

  // 2. TEST POBIERANIA WEB
  console.log(`\n🌐 [TEST 2: WEB] Pobieranie: [ID ${webSource.id}] ${webSource.name}`);
  console.log(`   URL: ${webSource.url}`);
  console.log(`   Kategoria: ${webSource.category}`);
  console.log(`   Wskazówki parsowania: "${webSource.hints}"`);

  const webRes = await fetch(webSource.url, {
    headers: { 'User-Agent': BOT_USER_AGENT, 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(webRes.status, 200, `Odpowiedź WEB musi mieć status 200 (jest ${webRes.status})`);
  const webHtml = await webRes.text();
  const { content, links } = cleanHtmlToMarkdown(webHtml, webSource.url);
  assert.ok(content.length > 100, 'Treść strony WEB po oczyszczeniu nie może być pusta');
  assert.ok(links.length > 0, 'Strona WEB musi zawierać odkryte linki do wydarzeń');

  console.log(`   ✅ Pobrano i oczyszczono pomyślnie!`);
  console.log(`   Długość przetworzonej treści: ${content.length} znaków.`);
  console.log(`   Liczba odkrytych odnośników do wydarzeń: ${links.length}.`);
  console.log(`   Przykładowe odnośniki:`, links.slice(0, 3));
  console.log(`   Fragment treści przekazywanej do AI:\n---\n${content.slice(0, 300)}...\n---`);
  console.log(`   Wskazówki parsowania dla AI: ${webSource.hints}`);

  console.log('\n🎉 OBYDWA TESTY POBRANIA (RSS + WEB) ZAKOŃCZONE PEŁNYM SUKCESEM (100% PASS)!');
}

run().catch((err) => {
  console.error('❌ Błąd podczas testu pobierania:', err.message);
  process.exit(1);
});
