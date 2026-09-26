# 🏙️ Co Tam KATO

> Nowoczesny, niezależny portal lokalny z codziennymi aktualnościami dla mieszkańców **Katowic oraz miast ościennych** (Chorzów, Siemianowice Śląskie, Sosnowiec, Mysłowice, Ruda Śląska, Tychy, Bytom, Czeladź itd.).

---

## 🚀 Zastosowane technologie

- **[Astro 5](https://astro.build/)** – ultralekki silnik generujący czysty kod HTML/CSS (Static Site Generation), zapewniający błyskawiczne czasy ładowania i świetne SEO.
- **[React 19](https://react.dev/)** – wykorzystany w architekturze "Wysp" (Astro Islands) do interaktywnego, natychmiastowego filtrowania miast, kategorii i wyszukiwarki na żywo.
- **[Tailwind CSS v4](https://tailwindcss.com/)** – nowoczesny miejski design system dopasowany do urządzeń mobilnych i komputerów.
- **[Keystatic CMS](https://keystatic.com/)** – wbudowany wizualny panel administracyjny dostępny pod adresem `/keystatic`.
- **GitHub Actions & Agent AI** – automatyzacja zbierająca poranne komunikaty o 6:00 rano, redagowana z użyciem Google Gemini AI i publikowana bez opłat serwerowych.

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

### Sposób A: Wizualny Panel Admina (Zalecany)
1. Uruchom `npm.cmd run dev` i wejdź na `http://localhost:4321/keystatic`.
2. Kliknij na kolekcję **"Aktualności i Wydarzenia"**.
3. Zobaczysz listę wszystkich wpisów. Możesz:
   - Dodać nowy wpis (przycisk *"Create news"*).
   - Zmienić status ze **Szkic (draft)** na **Opublikowany (published)**.
   - Wycofać niechciany wpis, ustawiając status **Usunięty (deleted)**. Plik pozostaje w repozytorium jako blokada ponownej publikacji tego źródła lub tematu.
   - Edytować treść w wygodnym edytorze wizualnym.

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

## 🤖 Automatyczny Agent AI (Codziennie o 6:00 rano)

W katalogu `.github/workflows/daily-digest.yml` oraz `scripts/daily-digest.mjs` skonfigurowany jest Agent AI.

### Jak aktywować darmowe AI (Google Gemini):
1. Wejdź na [Google AI Studio](https://aistudio.google.com/) i wygeneruj bezpłatny klucz API (**Gemini API Key**).
2. Przejdź do swojego repozytorium na GitHubie: `https://github.com/phxphoenix/co-tam-kato`.
3. Wejdź w: **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
4. Wpisz nazwę: `GEMINI_API_KEY` i wklej swój klucz.
5. Gotowe! Od teraz każdego ranka o 6:00 GitHub Actions uruchomi bota, sprawdzi komunikaty ze śląskich źródeł, zredaguje podsumowanie i utworzy nowy wpis w Twoim repozytorium!

*Możesz również przetestować działanie skryptu lokalnie komendą:*
```powershell
npm.cmd run digest
```

---

## 📂 Struktura katalogów

```text
├── .github/workflows/      # Przepisy automatyzacji (Agent AI o 6:00 i Deploy)
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
│   ├── pages/              # Routing podstron Astro
│   │   ├── index.astro     # Strona główna
│   │   ├── o-projekcie.astro # Podstrona informacyjna
│   │   └── wpis/[slug].astro # Szablon pojedynczego artykułu
│   └── styles/
│       └── global.css      # Style Tailwind CSS v4
├── astro.config.mjs        # Konfiguracja Astro
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
