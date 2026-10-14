# 🏙️ Co Tam KATO

> Nowoczesny, niezależny portal lokalny z codziennymi aktualnościami dla mieszkańców **Katowic oraz miast ościennych** (Chorzów, Siemianowice Śląskie, Sosnowiec, Mysłowice, Ruda Śląska, Tychy, Bytom, Czeladź itd.).

---

## 🚀 Zastosowane technologie

- **[Astro 5](https://astro.build/)** – ultralekki silnik generujący kod HTML/CSS (Static Site Generation / Serverless), zapewniający błyskawiczne czasy ładowania i świetne SEO.
- **[React 19](https://react.dev/)** – wykorzystany w architekturze "Wysp" (Astro Islands) do interaktywnego, natychmiastowego filtrowania miast, kategorii i wyszukiwarki na żywo.
- **[Tailwind CSS v4](https://tailwindcss.com/)** – nowoczesny miejski design system dopasowany do urządzeń mobilnych i komputerów.
- **[Keystatic CMS](https://keystatic.com/)** – wizualny panel administracyjny dostępny lokalnie oraz online na platformie Vercel pod adresem `/keystatic` z uwierzytelnianiem GitHub OAuth.
- **GitHub Actions & Agent AI** – automatyzacja działająca 2x dziennie (1:00 w nocy i 13:00 w ciągu dnia), redagowana z użyciem Google Gemini AI i publikowana bez opłat serwerowych.

---

## 🛠️ Pierwsze kroki (Uruchomienie lokalne)

Ponieważ pracujesz w systemie Windows i PowerShell, komendy wykonuj w terminalu:

```powershell
# 1. Wejdź do katalogu projektu (jeśli jeszcze w nim nie jesteś)
cd "c:\Users\phxpo\OneDrive\Dokumenty\Dev\Co Tam KATO"

# 2. Uruchom lokalny serwer deweloperski
npm.cmd run dev
```

Po uruchomieniu w terminalu pojawi się adres:
- **Strona główna**: `http://localhost:4321`
- **Panel Administratora (Keystatic)**: `http://localhost:4321/keystatic`

Aby zatrzymać działający serwer, wciśnij w terminalu kombinację klawiszy `Ctrl + C`.

---

## 📝 Jak zarządzać treściami i zachować kontrolę (Moderacja)

Masz do wyboru dwie metody edycji i publikacji:

### Sposób A: Wizualny Panel Admina (Online lub Lokalnie)
1. **Online (Vercel)**: Wejdź na `https://co-tam-kato.vercel.app/keystatic` (lub kliknij przycisk „Panel Admina” w nagłówku strony) i zaloguj się za pomocą konta GitHub.
2. **Lokalnie**: Uruchom `npm.cmd run dev` i otwórz `http://localhost:4321/keystatic`.
3. Kliknij na kolekcję **"Wszystkie artykuły"**.
4. Zobaczysz listę wszystkich wpisów. Możesz:
   - Dodać nowy wpis (przycisk *"Create entry"*).
   - Zmienić status ze **Szkic (draft)** na **Opublikowany (published)**.
   - Wycofać niechciany wpis, ustawiając status **Usunięty (deleted)** i zapisując zmianę. Plik pozostaje w repozytorium jako blokada ponownej publikacji tego źródła lub tematu. Nie używaj ikony kosza **Delete entry** — Keystatic usuwa wtedy plik, zamiast oznaczyć go jako usunięty.
   - Edytować treść w wygodnym edytorze wizualnym Markdoc.
   - Po zapisaniu zmian online w Keystatic zmiany są natychmiast commitowane do gałęzi `main` w Twoim repozytorium GitHub i Vercel automatycznie wdraża nową wersję!


### Sposób B: Zwykłe pliki Markdown
Wszystkie artykuły znajdują się w katalogu `src/content/news/`. Każdy plik to zwykły tekst z nagłówkiem (frontmatter):

```markdown
---
title: "Tytuł Twojego nowego wydarzenia"
pubDate: 2026-09-26
city: "katowice" # katowice, chorzow, sosnowiec, siemianowice, etc.
category: "wydarzenia" # wydarzenia, drogi-komunikacja, kultura, gastro, sport, alerty
status: "published" # 'published' lub 'draft'
summary: "Krótka zajawka na listę wiadomości."
location: "Spodek, al. Korfantego 35"
isAlert: false
sourceUrl: "https://przyklad.pl"
aiGenerated: false
---

Tutaj wpisujesz pełną treść artykułu. Możesz używać pogrubień, list punktowanych i nagłówków.
```

---

## 🤖 Automatyczny Agent AI (2x dziennie: 1:00 w nocy i 13:00 w dzień)

W katalogu `.github/workflows/daily-digest.yml` oraz `scripts/daily-digest.mjs` skonfigurowany jest Agent AI.

### Jak aktywować darmowe AI (Google Gemini):
1. Wejdź na [Google AI Studio](https://aistudio.google.com/) i wygeneruj bezpłatny klucz API (**Gemini API Key**).
2. Przejdź do swojego repozytorium na GitHubie: `https://github.com/phxphoenix/co-tam-kato`.
3. Wejdź w: **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
4. Wpisz nazwę: `GEMINI_API_KEY` i wklej swój klucz.
5. Gotowe! Od teraz 2 razy dziennie (o 1:00 w nocy i 13:00 w ciągu dnia czasu polskiego) GitHub Actions uruchomi bota, sprawdzi komunikaty ze śląskich źródeł, zredaguje podsumowanie i zaktualizuje stronę!

*Możesz również przetestować działanie skryptu lokalnie komendą:*
```powershell
npm.cmd run digest
```

### Baza monitorowanych źródeł:
- **Serwisy regionalne i miejskie**: MojeKatowice.pl, Metropolia GZM, Śląska Opinia, MojChorzow.pl, MojeTychy.pl, MojBytom.pl, Silesion.PL, Gliwice.eu.
- **Kluczowe obiekty i instytucje**:
  - **Park Śląski** (`https://parkslaski.pl/en/news`) – aktualności i wydarzenia w parku,
  - **Stadion Śląski** (`https://superautostadionslaski.pl/wiadomosci`) – relacje i zapowiedzi imprez na Stadionie Śląskim,
  - **Katowicki Spodek** (`https://www.spodekkatowice.pl/pl/wydarzenia/61/`) – oficjalny kalendarz koncertów i widowisk w Spodku,
  - **MCK Katowice** (`https://www.mckkatowice.pl/pl/wydarzenia/61/`) – kalendarz kongresów, targów i imprez w Międzynarodowym Centrum Kongresowym.

---

## 📂 Struktura katalogów

```text
├── .github/workflows/      # Przepisy automatyzacji (Agent AI 1:00 i 13:00 oraz Deploy)
├── public/                 # Statyczne pliki publiczne (favicon.svg itp.)
├── scripts/
│   └── daily-digest.mjs    # Skrypt Agenta AI do pobierania i redagowania newsów
├── src/
│   ├── components/         # Komponenty interfejsu (React & Astro)
│   │   ├── CityBadge.tsx
│   │   ├── CategoryBadge.tsx
│   │   ├── InteractiveFeed.tsx   # Wyszukiwarka i filtry na żywo (React)
│   │   ├── QuickAlertBar.tsx     # Pasek pilnych ostrzeżeń (React)
│   │   ├── Header.astro
│   │   └── Footer.astro
│   ├── content/
│   │   └── news/           # Folder ze wszystkimi wiadomościami w Markdown (.md)
│   ├── layouts/
│   │   └── BaseLayout.astro # Główny szkielet strony i SEO
│   ├── lib/
│   │   └── constants.ts    # Baza miast, kolorów i kategorii
│   ├── pages/              # Routing podstron Astro (czyste SSG)
│   │   ├── index.astro     # Strona główna
│   │   ├── dla-dzieci.astro # Podstrona z wydarzeniami dla dzieci
│   │   ├── o-projekcie.astro # Podstrona informacyjna
│   │   ├── ulubione.astro  # Zapisane ulubione artykuły
│   │   └── wpis/[slug].astro # Szablon pojedynczego artykułu
│   ├── server/             # Handlery SSR (proxy OAuth Keystatic dla Vercel)
│   │   └── keystatic-api.ts
│   ├── styles/
│   │   └── global.css      # Style Tailwind CSS v4
│   └── env.d.ts            # Deklaracje typów dla Astro i środowiska
├── astro.config.mjs        # Konfiguracja Astro (dualizm SSG / Vercel Serverless)
├── keystatic.config.ts     # Konfiguracja panelu admina Keystatic
└── package.json            # Zależności i skrypty npm
```

---

## 🌐 Publikacja i aktualizacja na GitHubie

Aby wysłać swoje zmiany do GitHuba po edycji plików:

```powershell
git add .
git commit -m "Dodano nowe wpisy i poprawki"
git push
```
