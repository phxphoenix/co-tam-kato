# Dokumentacja projektu Co Tam KATO

## 1. Cel i zakres

Co Tam KATO to polskojęzyczny, lokalny portal informacyjny dla Katowic i okolicznych miast Górnośląsko-Zagłębiowskiej Metropolii. Publikuje krótkie informacje o wydarzeniach, kulturze, gastronomii, sporcie, komunikacji i alertach. Osobna strona zbiera propozycje dla dzieci. Serwis nie korzysta z bazy danych: artykuły są plikami Markdown w repozytorium, a Astro buduje z nich statyczne strony.

Dokument opisuje kod znajdujący się w repozytorium w chwili przeglądu (27 września 2026 r.). W katalogu `src/content/news/` znajduje się 12 plików artykułów. Lokalny checkout był czysty i zsynchronizowany z `origin/main`; ostatni widoczny commit to `e439536` z 26 września 2026 r. Nie uruchamiano testów ani kompilacji.

## 2. Technologie i sposób uruchamiania

- **Astro 5** generuje HTML stron podczas budowania (SSG) oraz obsługuje Serverless na Vercelu (`@astrojs/vercel`).
- **React 19** obsługuje interaktywne wyspy: filtrowanie listy, ulubione i pasek alertów.
- **Tailwind CSS 4** wraz z pluginem Vite dostarcza style; dodatkowe reguły są w `src/styles/global.css`.
- **TypeScript** opisuje konfigurację i komponenty React.
- **Keystatic CMS** edytuje kolekcję artykułów Markdown lokalnie (zapis na dysk) oraz w chmurze na Vercelu (zapis commitów bezpośrednio do repozytorium GitHub via GitHub App OAuth).
- **Vercel** obsługuje produkcyjne wdrożenie strony oraz dynamiczne trasy API (`/api/keystatic/*`) i panel administracyjny (`/keystatic`).
- **GitHub Actions** wykonuje automatyczny digest (1:00 i 13:00) oraz wdrożenie na GitHub Pages / Vercel.
- **Google Gemini API** jest używane przez skrypt digestu; klucz musi być dostępny jako sekret `GEMINI_API_KEY`.

Wymagane skrypty npm z `package.json`:

| Polecenie | Działanie |
| --- | --- |
| `npm run dev` | Uruchamia serwer Astro do pracy lokalnej. |
| `npm run build` | Generuje statyczną witrynę w `dist/`. |
| `npm run preview` | Serwuje lokalnie zbudowaną witrynę. |
| `npm run digest` | Uruchamia `scripts/daily-digest.mjs`; wymaga klucza Gemini i dostępu do źródeł/API. |

Keystatic działa dwutorowo:
1. **Lokalnie**: `storage: { kind: 'local' }` zapisuje pliki w `src/content/news/`.
2. **Na Vercelu (`NODE_ENV=production`)**: `storage: { kind: 'github' }` wykorzystuje autoryzację GitHub App i tworzy commity bezpośrednio w repozytorium `phxphoenix/co-tam-kato`.
Trasa API `src/pages/api/keystatic/[...params].ts` automatycznie mapuje zapytania proxy Vercela na publiczną domenę `co-tam-kato.vercel.app`, zapewniając prawidłowy OAuth handshake.


## 3. Struktura kodu

```text
├── .github/workflows/
│   ├── daily-digest.yml       # harmonogram i publikacja plików digestu
│   └── deploy.yml             # build oraz wdrożenie na GitHub Pages
├── public/favicon.svg         # favicon
├── scripts/daily-digest.mjs   # pobieranie RSS, redakcja AI, zapis Markdown
├── src/
│   ├── components/            # elementy Astro i React
│   ├── content/news/          # źródłowe artykuły Markdown
│   ├── layouts/BaseLayout.astro
│   ├── lib/constants.ts       # etykiety, kolory miast i kategorii
│   ├── pages/                 # strony Astro i trasa artykułu
│   ├── styles/global.css
│   └── content.config.ts      # loader i walidacja schematu news
├── astro.config.mjs
├── keystatic.config.ts
├── package.json
└── tsconfig.json
```

`node_modules/`, `dist/` i `.astro/` są artefaktami lokalnymi ignorowanymi przez Git. Treści w `src/content/news/` i konfiguracja są częścią repozytorium.

## 4. Strony i przepływ wyświetlania

### Strona główna (`src/pages/index.astro`)

Astro odczytuje kolekcję `news`, pomija wpisy ze statusem `deleted`, sortuje pozostałe malejąco według `sourceDate`, a gdy tej daty nie ma — `pubDate`. Przygotowuje z metadanych prosty obiekt przekazywany do React. Treść artykułów nie jest wysyłana do komponentu listy; znajduje się na oddzielnych stronach.

Strona główna zawiera sekcję wprowadzającą oraz `InteractiveFeed` uruchamiany dyrektywą `client:load`. Oznacza to, że HTML listy powstaje w buildzie, a klient pobiera React, by włączyć filtrowanie i wyszukiwanie.

### Lista i filtry (`src/components/InteractiveFeed.tsx`)

Komponent umożliwia filtrowanie według miasta, kategorii, wydarzeń dla dzieci, zakresu dat, statusu publikacji oraz zapytania tekstowego. Wyszukiwanie sprawdza tytuł, streszczenie, lokalizację i polską nazwę miasta. Wyniki można sortować od najnowszych lub najstarszych (według daty źródła z zapasową datą publikacji). Można wyczyścić aktywne filtry. Karty pokazują miasto, kategorię, datę, lokalizację, oznaczenie AI i odnośnik do szczegółów.

Domyślnie lista pokazuje wyłącznie `published`. Jeśli w danych znajdują się szkice, widoczny jest licznik i przełącznik podglądu szkiców oraz link do Keystatic. Przełączenie podglądu pokazuje szkice zamiast opublikowanych wpisów. W statycznym publicznym buildzie szkice również są częścią wygenerowanych danych i tras — ukrywa je interfejs, a nie serwer z uwierzytelnianiem. Dlatego status `draft` nie stanowi kontroli dostępu ani poufności.

### Artykuł (`src/pages/wpis/[slug].astro`)

Astro generuje stronę dla każdego wpisu, którego status nie jest `deleted`; identyfikatorem adresu jest nazwa pliku bez `.md`/`.mdx`. Strona pokazuje metadane, streszczenie i renderowaną treść Markdown, a także link do źródła, jeśli podano. Wyświetla do dwóch pierwszych opublikowanych wpisów z tego samego miasta jako powiązane. Wpis `draft` ma etykietę szkicu, lecz sam route również jest generowany, więc nie należy traktować go jako prywatnego.

### Strona „Dla dzieci” (`src/pages/dla-dzieci.astro`)

Korzysta z tego samego feedu, ale domyślnie aktywuje kategorię `dla-dzieci` i przełącznik `onlyKids`. Za wydarzenia dziecięce uważa wpisy z kategorią `dla-dzieci` albo `isForKids: true`. Może pokazywać przedział wiekowy.

### Strona „O projekcie” (`src/pages/o-projekcie.astro`)

Statycznie opisuje misję, AI, moderację i technologie. To tekst redakcyjny strony; nie jest automatycznie synchronizowany z działaniem kodu. Przykładowo fragment o sprawdzaniu oficjalnych komunikatów opisuje ambicję, podczas gdy implementacja digestu pobiera aktualnie dwa kanały RSS opisane w dalszej części dokumentu.

### Wspólny szablon i nawigacja

`src/layouts/BaseLayout.astro` ustawia język dokumentu na polski, metadane SEO/Open Graph/Twitter, favicon, font, nagłówek, stopkę i opcjonalny pasek alertu. `Header.astro` ma linki do wiadomości, strony dziecięcej, opisu i Keystatic. `Footer.astro` zawiera opis, zasięg, nawigację i link do GitHuba. `CityBadge.tsx` i `CategoryBadge.tsx` mapują kody danych na etykiety i style z `src/lib/constants.ts`.

### Alerty

Na stronie głównej Astro wybiera wpisy `published` oznaczone `isAlert: true` i przekazuje je do layoutu. `QuickAlertBar.tsx` pokazuje pierwszy (czyli najnowszy według sortowania źródłowego) wpis i pozwala użytkownikowi schować pasek w bieżącym stanie komponentu. Wyróżnienie `isAlert` samo w sobie nie publikuje szkicu jako alertu.

## 5. Model treści

Kolekcja jest zdefiniowana w `src/content.config.ts` i czytana globem z `src/content/news`. Zod waliduje frontmatter przy budowie:

| Pole | Znaczenie |
| --- | --- |
| `title` | Tytuł. |
| `pubDate` | Data dodania do serwisu; wymagana i konwertowana do daty. |
| `sourceDate` | Opcjonalna data publikacji oryginalnego źródła. Lista używa jej jako daty głównej, z `pubDate` jako zapasem. |
| `city` | Jeden z kodów miasta/rejonu z dozwolonego zestawu. |
| `category` | Jedna z kategorii: dla dzieci, wydarzenia, drogi/komunikacja, kultura, gastro, sport, alerty. |
| `status` | `published`, `draft` lub `deleted`; domyślnie `published`. |
| `summary` | Streszczenie używane w kartach i metadanych strony artykułu. |
| `location` | Opcjonalny tekst lokalizacji. |
| `isAlert` | Czy wpis może pojawić się w pasku alertu; domyślnie `false`. |
| `isForKids` | Flaga wydarzenia przyjaznego dzieciom; domyślnie `false`. |
| `ageRange` | Opcjonalny tekstowy przedział wieku. |
| `sourceUrl` | Opcjonalny adres źródła. |
| `aiGenerated` | Oznaczenie treści przygotowanej przez digest; domyślnie `false`. |
| treść pliku | Markdown renderowany na stronie artykułu. |

Zestawy kodów miast i kategorii są powtórzone w schemacie, Keystatic, stałych UI oraz walidatorze skryptu. Dodanie nowej wartości wymaga utrzymania tych miejsc w zgodzie. W aktualnym schemacie `status` ma wartość domyślną, ale Keystatic opisuje go jako pole selektora; należy uzupełniać wymagane metadane zgodnie z edytorem i walidacją buildu.

## 6. Keystatic i moderacja

`keystatic.config.ts` definiuje lokalną kolekcję news z plikami w `src/content/news/*`. Edytor udostępnia pola metadanych i treść Markdoc. W trybie lokalnym formularz zapisuje zmiany do plików. Panel `/keystatic` w kodzie nie konfiguruje zewnętrznego magazynu ani uwierzytelniania; konfiguracja `storage.kind` to `local`. Build Pages domyślnie nie dołącza integracji Keystatic, a wdrożony statyczny serwis nie jest panelem administracyjnym.

Statusy mają praktyczne znaczenie:

- `published` — widoczny w publicznym feedzie i generowany jako artykuł.
- `draft` — ukryty w domyślnym feedzie, możliwy do przełączenia w podglądzie; nadal trafia do statycznego builda i URL artykułu.
- `deleted` — pominięty w feedzie i w generowaniu strony artykułu. Plik pozostaje, by zachować informację o wycofaniu.

Digest sprawdza zachowane wpisy `deleted` i próbuje nie wygenerować ponownie tego samego tematu. README i opis pola Keystatic zalecają zmianę statusu na `deleted`, a nie usuwanie pliku, bo fizyczne skasowanie usuwa tę blokadę.

## 7. Automatyczny digest

### Harmonogram i źródła

`.github/workflows/daily-digest.yml` uruchamia workflow dwa razy na dobę: o `23:00 UTC` (01:00 czasu polskiego CEST) oraz `11:00 UTC` (13:00 / 1:00 PM czasu polskiego CEST), a także na żądanie przez `workflow_dispatch`. (W czasie zimowym CET godziny te odpowiadają odpowiednio 00:00 i 12:00 czasu polskiego). Job używa Ubuntu, Node 22, `npm ci`, a następnie uruchamia `npm run digest` z sekretem `GEMINI_API_KEY`.

`scripts/daily-digest.mjs` pobiera materiały ze zróżnicowanej bazy źródeł (kanały RSS oraz dedykowane parsery HTML dla czołowych obiektów widowiskowych i instytucji):

1. **mojeKatowice.pl** (`https://mojekatowice.pl/rss`) — Katowice (RSS)
2. **Wydarzenia Metropolia GZM** (`https://metropoliagzm.pl/feed/`) — cała okolica (RSS)
3. **Śląska Opinia** (`https://slaskaopinia.pl/feed/`) — cała okolica (RSS)
4. **mojChorzow.pl** (`https://mojchorzow.pl/rss`) — Chorzów (RSS)
5. **mojeTychy.pl** (`https://mojetychy.pl/rss`) — Tychy (RSS)
6. **mojBytom.pl** (`https://mojbytom.pl/rss`) — Bytom (RSS)
7. **Silesion.PL** (`https://silesion.pl/feed/`) — cała okolica (RSS)
8. **Gliwice.eu** (`https://gliwice.eu/rss.xml`) — Gliwice / cała okolica (RSS)
9. **Park Śląski** (`https://parkslaski.pl/en/news` z zapasowym `https://parkslaski.pl/aktualnosci`) — Chorzów (dedykowany parser kart aktualności)
10. **Stadion Śląski** (`https://superautostadionslaski.pl/wiadomosci`) — Chorzów (dedykowany parser wiadomości)
11. **Katowicki Spodek** (`https://www.spodekkatowice.pl/pl/wydarzenia/61/`) — Katowice (dedykowany parser kalendarza wydarzeń)
12. **Międzynarodowe Centrum Kongresowe (MCK)** (`https://www.mckkatowice.pl/pl/wydarzenia/61/`) — Katowice (dedykowany parser kalendarza wydarzeń)

Skrypt parsuje standardowe pola RSS/Atom oraz strukturę HTML serwisów instytucjonalnych (tytuł, link, opis, datę), usuwa znaczniki HTML i encje XML. Przyjmuje aktualności z ostatnich 14 dni oraz nadchodzące wydarzenia z kalendarzy (do 45 dni w przód). Błąd pojedynczego źródła nie przerywa pracy skryptu; dopiero brak jakichkolwiek materiałów z całej bazy źródeł kończy job błędem.

### Redakcja i zabezpieczenia

Do Gemini wysyłanych jest maksymalnie 30 elementów źródłowych, a prompt żąda maksymalnie trzech artykułów. Model ma zwracać JSON, wybrać kategorię/miasto, streszczenie, krótką treść Markdown i ustawić niepewne informacje jako szkice. Model nie ma otrzymywać klucza z treści promptu; klucz jest nagłówkiem żądania API. Skrypt ponawia błędy 429/serwerowe lub przejściowe maksymalnie trzy próby z rosnącym opóźnieniem.

Odpowiedź jest parsowana jako JSON i sprawdzana: wymagane są tytuł, streszczenie, treść i URL; miasto/kategoria/status muszą być dozwolone; URL musi być HTTPS i dokładnie pochodzić z pobranych pozycji. Data źródła pochodzi z odpowiadającego elementu RSS i jest formatowana dla `Europe/Warsaw`. Wpis otrzymuje nazwę `YYYY-MM-DD-slug.md`, status zaproponowany przez model, `aiGenerated: true`, a brakująca lokalizacja staje się pustym tekstem.

Przed zapisem skrypt porównuje artykuły z lokalnymi rekordami `deleted`, według znormalizowanego URL albo tytułu (w tym progu podobieństwa słów), aby ograniczyć ponowną publikację wycofanych tematów. Pomija też plik, jeśli taki sam slug już istnieje. Walidacja Astro w CI stanowi drugi etap sprawdzenia treści.

### Zapis i publikacja

Po digest skrypt workflow uruchamia `npm run build`. Następnie GitHub Actions dodaje wyłącznie `src/content/news/`, tworzy commit tylko wtedy, gdy wykryto zmiany, i wypycha go do `main`. Po zakończeniu pracy workflowu digestu, workflow wdrożeniowy `deploy.yml` zostaje automatycznie wywołany przez mechanizm `workflow_run`, co powoduje przebudowanie serwisu i odświeżenie strony na GitHub Pages. Jeśli nie ma zmian w artykułach, commit nie powstaje.

Automatyzacja nie oznacza, że każdy dzień zakończy się publikacją: może nie być materiału, API może zawieść albo wszystkie propozycje mogą zostać odrzucone/uznane za duplikaty. Wygenerowany przez AI status może być `published`, więc human-in-the-loop nie jest twardą bramką dla każdego wpisu. Ponadto zestaw źródeł w kodzie ograniczony jest do dwóch RSS-ów.

## 8. Budowanie i wdrożenie

`.github/workflows/deploy.yml` uruchamia build po push do `main` albo ręcznie. Instaluje Node 22 i zależności, wykonuje `npm run build`, publikuje katalog `dist` jako GitHub Pages artifact, a osobny job `deploy` wysyła go do środowiska `github-pages`. Uprawnienia obejmują odczyt repozytorium, publikację Pages i token OIDC. Grupowanie `pages` zapobiega równoległym wdrożeniom.

Kod zawiera adres kanonicznej witryny `https://phxphoenix.github.io` i bazę `/co-tam-kato/`. Rzeczywisty publiczny adres skonfigurowany w ustawieniach Pages/GitHub należy potwierdzić w repozytorium; sam plik Astro nie dowodzi, że workflow ostatnio zakończył się powodzeniem.

## 9. Jak dodać lub zmienić artykuł

1. Utwórz lub edytuj plik `.md` w `src/content/news/`.
2. Uzupełnij frontmatter zgodnie z polami i dozwolonymi kodami w `src/content.config.ts`.
3. Ustaw `status: published`, `draft` albo `deleted` stosownie do stanu redakcyjnego.
4. Wpisz prawidłową datę `pubDate`, a jeśli źródło ma inną datę publikacji — także `sourceDate`.
5. Wykonaj lokalny `npm run build`, aby sprawdzić walidację Astro.
6. Zacommituj zmianę i wypchnij do `main`; push uruchamia GitHub Pages deploy.

Alternatywnie uruchom `npm run dev`, otwórz lokalny `/keystatic` i zapisz wpis przez formularz. README podaje odpowiednie polecenie PowerShell `npm.cmd run dev` dla Windows.

## 10. Bieżąca zawartość repozytorium

W stanie przeglądu jest 12 rekordów: 11 ze statusem `published` i jeden rekord demonstracyjny oznaczony w treści jako przykład szkicu (`2026-09-26-siemianowice-bieg-szkic.md`). **Uwaga:** frontmatter tego pliku ma faktycznie `status: published`, mimo tekstu w treści mówiącego o `draft`; na podstawie kodu jest publikowany, a komentarz nie zmienia statusu. Trzy pliki są oznaczone jako przyjazne dzieciom (w tym wpisy kategorii dziecięcej), jeden opublikowany wpis jest alertem. Występują wpisy z pustym `sourceUrl`, a pole jest opcjonalne. Zawartość jest przykładowym zestawem dla 26 września 2026 r., nie gwarancją aktualności ani potwierdzeniem, że wszystkie opisane wydarzenia wciąż trwają.

## 11. Ograniczenia i punkty utrzymaniowe

- Strona jest generowana statycznie; filtry działają wyłącznie na wbudowanym zbiorze danych i nie pobierają świeżych danych podczas wizyty.
- Status `draft` nie chroni treści w statycznym wdrożeniu: dane są w JS strony, a trasa wpisu może być bezpośrednio dostępna. Nie zapisuj poufnych szkiców w repozytorium publicznym.
- `/keystatic` jest opisany/nawigowany w aplikacji, ale konfiguracja produkcyjna pomija integrację, chyba że ustawiono `ENABLE_KEYSTATIC_BUILD=true`; lokalne `storage` nie zapewnia hostowanego workflow edycji.
- Harmonogram `23:00 UTC` oraz `11:00 UTC` odpowiada 01:00 i 13:00 w Polsce w czasie letnim CEST (oraz 00:00 i 12:00 zimą CET).
- Opis strony „O projekcie” i README zawierają stwierdzenia szersze niż aktualny kod (np. katalog oficjalnych źródeł), dlatego przy zmianach automatyzacji należy aktualizować także dokumentację marketingową.
- Lista miast/kategorii występuje w kilku plikach; jej rozbudowa wymaga synchronizacji walidacji, CMS, skryptu i UI.
- `npm run digest` zapisuje zmiany w working tree; lokalnie nie publikuje ich samodzielnie. Commit/push wykonuje wyłącznie workflow GitHub Actions.

## 12. Najważniejsze pliki

- `astro.config.mjs` — integracje i konfiguracja bazy witryny.
- `src/content.config.ts` — loader i typowany schemat wpisu.
- `keystatic.config.ts` — pola edytora treści.
- `src/pages/index.astro` — agregacja i serializacja wiadomości.
- `src/components/InteractiveFeed.tsx` — wyszukiwarka i filtry.
- `src/pages/wpis/[slug].astro` — generowanie pojedynczych artykułów.
- `scripts/daily-digest.mjs` — pobieranie RSS, walidacja AI i zapis wpisów.
- `.github/workflows/daily-digest.yml` — codzienny job redakcyjny.
- `.github/workflows/deploy.yml` — kompilacja i GitHub Pages.
- `src/lib/constants.ts` — nazwy i style miast oraz kategorii.
