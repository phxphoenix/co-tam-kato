import fs from 'node:fs';
import path from 'node:path';

// Ścieżka do folderu z artykułami
const NEWS_DIR = path.resolve('src/content/news');

// Przykładowe publiczne źródła RSS z Katowic i aglomeracji
const RSS_FEEDS = [
  {
    name: 'Katowice.eu Oficjalne',
    url: 'https://www.katowice.eu/Strony/rss.aspx',
    defaultCity: 'katowice',
  },
  {
    name: 'Wydarzenia Metropolia GZM',
    url: 'https://metropoliagzm.pl/feed/',
    defaultCity: 'cala-okolica',
  },
];

// Pomocnicza funkcja czyszcząca tagi HTML
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
}

// Prosty parser RSS (XML) bez zewnętrznych zależności
function parseRssXml(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/description>/i);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);

    const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
    const link = linkMatch ? (linkMatch[1] || linkMatch[2] || '').trim() : '';
    const description = descMatch ? stripHtml(descMatch[1] || descMatch[2] || '') : '';
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString();

    if (title) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

// Wywołanie Gemini API do redagowania i kategoryzacji wiadomości
async function analyzeWithGemini(newsItems, apiKey) {
  const prompt = `
Jesteś lokalnym redaktorem serwisu informacyjnego "Co Tam KATO" dla mieszkańców Katowic i miast ościennych (Chorzów, Siemianowice, Sosnowiec, Mysłowice, Ruda Śląska, Tychy, Bytom, Czeladź itd.).

Przeanalizuj poniższe surowe wiadomości zebrane ze śląskich źródeł:
${JSON.stringify(newsItems.slice(0, 8), null, 2)}

Wybierz maksymalnie 3 najciekawsze i najbardziej wartościowe wiadomości na dzisiejszy dzień.
Dla każdej wybranej wiadomości przygotuj obiekt w formacie JSON zgodnym ze schematem:
[
  {
    "title": "Chwytliwy, rzetelny tytuł (bez clickbaitu)",
    "city": "katowice" | "chorzow" | "siemianowice" | "sosnowiec" | "myslowice" | "ruda-slaska" | "tychy" | "czeladz" | "bytom" | "swietochlowice" | "dabrowa-gornicza" | "cala-okolica",
    "category": "wydarzenia" | "drogi-komunikacja" | "kultura" | "gastro" | "sport" | "alerty",
    "status": "published", // lub "draft" jeśli wymaga dodatkowej weryfikacji
    "summary": "Zwięzłe podsumowanie w 1-2 zdaniach dla szybkiego czytania",
    "location": "Dokładne miejsce, ulica lub obiekt jeśli podano (np. Spodek, Park Śląski)",
    "isAlert": false, // true jeśli to pilne utrudnienia na drodze / awaria / alert pogodowy
    "sourceUrl": "Link do źródła",
    "content": "Pełna treść w formacie Markdown (2-3 akapity z wypunktowaniem najważniejszych informacji dla mieszkańców)"
  }
]

Odpowiedz WYŁĄCZNIE poprawnym blokiem JSON (bez dodatkowych komentarzy).
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

// Funkcja generująca bezpieczny slug do nazwy pliku
function slugify(text) {
  const charMap = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  };
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (m) => charMap[m] || m)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function main() {
  console.log('🤖 [Co Tam KATO Agent] Uruchamianie porannego przeglądu wiadomości...');
  const today = new Date().toISOString().split('T')[0];

  // 1. Zbieranie surowych wiadomości
  const collectedRawItems = [];
  for (const feed of RSS_FEEDS) {
    try {
      console.log(`📡 Sprawdzam źródło: ${feed.name}...`);
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'CoTamKato-Bot/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const xml = await res.text();
        const items = parseRssXml(xml);
        console.log(`   Znaleziono ${items.length} pozycji.`);
        collectedRawItems.push(...items);
      }
    } catch (err) {
      console.warn(`   ⚠️ Nie udało się pobrać ${feed.name}: ${err.message}`);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  let articlesToSave = [];

  // 2. Analiza przez AI lub tryb symulacji/szablonu
  if (apiKey) {
    console.log('🧠 Analizowanie i redagowanie treści przy użyciu Gemini AI...');
    try {
      articlesToSave = await analyzeWithGemini(collectedRawItems, apiKey);
    } catch (err) {
      console.error('❌ Błąd analizy Gemini:', err.message);
    }
  } else {
    console.log('💡 [INFO] Brak zmiennej GEMINI_API_KEY.');
    console.log('   Aby włączyć pełną automatyzację AI, dodaj klucz GEMINI_API_KEY w ustawieniach GitHub Secrets lub pliku .env.');
    console.log('   Uruchamiam tryb demonstracyjny z zebranych nagłówków...');

    if (collectedRawItems.length > 0) {
      const topItem = collectedRawItems[0];
      articlesToSave.push({
        title: topItem.title,
        city: 'katowice',
        category: 'wydarzenia',
        status: 'draft', // domyślnie jako szkic do zatwierdzenia
        summary: topItem.description.slice(0, 160) + '...',
        location: 'Katowice i okolice',
        isAlert: false,
        sourceUrl: topItem.link,
        content: `${topItem.description}\n\n*Wiadomość pobrana automatycznie z ${topItem.link}*`,
      });
    }
  }

  // 3. Zapisywanie artykułów jako pliki Markdown w src/content/news/
  if (articlesToSave.length === 0) {
    console.log('ℹ️ Brak nowych artykułów do zapisania.');
    return;
  }

  if (!fs.existsSync(NEWS_DIR)) {
    fs.mkdirSync(NEWS_DIR, { recursive: true });
  }

  let savedCount = 0;
  for (const article of articlesToSave) {
    const slug = `${today}-${slugify(article.title)}`;
    const filePath = path.join(NEWS_DIR, `${slug}.md`);

    // Jeśli plik już istnieje, nie nadpisujemy
    if (fs.existsSync(filePath)) {
      console.log(`⏭️ Wpis "${slug}" już istnieje na dysku.`);
      continue;
    }

    const fileContent = `---
title: ${JSON.stringify(article.title)}
pubDate: ${today}
city: ${JSON.stringify(article.city || 'katowice')}
category: ${JSON.stringify(article.category || 'wydarzenia')}
status: ${JSON.stringify(article.status || 'draft')}
summary: ${JSON.stringify(article.summary || '')}
location: ${JSON.stringify(article.location || '')}
isAlert: ${Boolean(article.isAlert)}
sourceUrl: ${JSON.stringify(article.sourceUrl || '')}
aiGenerated: true
---

${article.content || article.summary}
`;

    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`✅ Zapisano nowy wpis: ${slug}.md (status: ${article.status})`);
    savedCount++;
  }

  console.log(`🎉 Zakończono! Zapisano ${savedCount} nowych artykułów.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
