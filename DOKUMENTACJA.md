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
- **GitHub Actions** wykonuje automatyczny digest 4 razy na dobę (01:00, 07:00, 13:00, 19:00 czasu polskiego) oraz wdrożenie na GitHub Pages / Vercel.
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
2. **Na Vercelu (`isVercel` / `VERCEL=1`)**: `storage: { kind: 'github' }` wykorzystuje autoryzację GitHub App i tworzy commity bezpośrednio w repozytorium `phxphoenix/co-tam-kato`.
Trasa API Keystatica znajduje się w dedykowanym module serwerowym `src/server/keystatic-api.ts` (poza katalogiem `src/pages/`). Jest ona dynamicznie wstrzykiwana do Astro (`injectRoute` w `astro.config.mjs`) wyłącznie na Vercelu, gdzie adapter `@astrojs/vercel` obsługuje SSR. W kompilacjach statycznych SSG (GitHub Pages, GitHub Actions CI) trasa ta nie jest rejestrowana, co zapobiega błędowi `[NoAdapterInstalled]`. Handler ten automatycznie mapuje zapytania proxy Vercela na publiczną domenę `co-tam-kato.vercel.app`, zapewniając prawidłowy OAuth handshake.


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
│   ├── server/                # handlery SSR (np. proxy OAuth Keystatic dla Vercel)
│   ├── styles/global.css
│   ├── content.config.ts      # loader i walidacja schematu news
│   └── env.d.ts               # deklaracje typów dla Astro i środowiska
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

`.github/workflows/daily-digest.yml` uruchamia workflow 4 razy na dobę (o 01:00, 07:00, 13:00 oraz 19:00 czasu polskiego Europe/Warsaw), a także na żądanie przez `workflow_dispatch`. Harmonogram zdefiniowany jest jako dwa zwarte wyrażenia cron z automatycznym wykrywaniem pory roku (czas letni CEST vs zimowy CET):
- Czas letni (CEST, UTC+2): `0 5,11,17,23 * * *` (odpowiada 07:00, 13:00, 19:00 oraz 01:00 czasu polskiego).
- Czas zimowy (CET, UTC+1): `0 0,6,12,18 * * *` (odpowiada 01:00, 07:00, 13:00 oraz 19:00 czasu polskiego).
Skrypt `scripts/daily-digest.mjs` weryfikuje aktualne przesunięcie strefy (`Europe/Warsaw`) przy uruchomieniu z parametrem `--scheduled` i pomija wywołanie nieodpowiedniego crona dla bieżącego sezonu, zapewniając dokładnie 4 wywołania na dobę przez cały rok bez konieczności ręcznych zmian. Zastosowanie wielogodzinnych wyrażeń cron w jednym wpisie sprawia również, że GitHub Actions UI poprawnie prezentuje w interfejsie wszystkie godziny wywołań. Job używa Ubuntu, Node 22, `npm ci`, a następnie uruchamia `npm run digest` z sekretem `GEMINI_API_KEY`.

`scripts/daily-digest.mjs` pobiera materiały ze zróżnicowanej bazy źródeł zdefiniowanej w `config/sources.md` (Single Source of Truth), filtrując wpisy ze statusem `ACTIVE`. Dla każdego źródła stosowany jest routing na podstawie kolumny `Typ`:
- `RSS`: strumienie XML/Atom pobierane i parsowane ze szczególnym uwzględnieniem tego, że data wydarzenia znajduje się w treści/tytule wpisu, a nie w polu `pubDate`.
- `WEB`: dedykowane parsery obiektów widowiskowych (Spodek, MCK, Park Śląski, Stadion Śląski) oraz ogólny mechanizm czyszczenia HTML do Markdownu z ekstrakcją linków i obsługą alternatywnych adresów ze wskazówek.
- `DYNAMIC_WEB`: renderowanie stron opartych na JS (np. GoingApp) za pośrednictwem Jina Reader (`https://r.jina.ai/${url}`).

Błąd pojedynczego źródła jest izolowany blokiem try/catch i nie przerywa pracy skryptu dla pozostałych źródeł; dopiero brak jakichkolwiek materiałów ze wszystkich źródeł kończy proces błędem.

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
- **Dualizm architektoniczny (SSG vs Vercel SSR)**: Serwis obsługuje dwa tryby budowy kontrolowane zmienną `isVercel` (`process.env.VERCEL === '1'` lub `DEPLOY_TARGET === 'vercel'`). Na Vercelu aktywny jest adapter `@astrojs/vercel` oraz dynamicznie wstrzykiwana trasa `/api/keystatic/*` (`src/server/keystatic-api.ts`), co pozwala na działanie chmurowego panelu Keystatic z autoryzacją GitHub OAuth. W czystym buildzie statycznym (lokalnym, w GitHub Actions CI dla walidacji digestu oraz wdrożeniu GitHub Pages) adapter jest pomijany (`undefined`), a żadne trasy SSR nie znajdują się w katalogu `src/pages/`, co chroni proces przed błędem `[NoAdapterInstalled]`.
- Harmonogram w UTC (`23:00`, `05:00`, `11:00`, `17:00`) odpowiada godzinom 01:00, 07:00, 13:00 i 19:00 w Polsce w czasie letnim CEST (oraz 00:00, 06:00, 12:00, 18:00 zimą CET).
- Opis strony „O projekcie” i README zawierają stwierdzenia szersze niż aktualny kod (np. katalog oficjalnych źródeł), dlatego przy zmianach automatyzacji należy aktualizować także dokumentację marketingową.
- Lista miast/kategorii występuje w kilku plikach; jej rozbudowa wymaga synchronizacji walidacji, CMS, skryptu i UI.
- `npm run digest` zapisuje zmiany w working tree; lokalnie nie publikuje ich samodzielnie. Commit/push wykonuje wyłącznie workflow GitHub Actions.

## 12. Najważniejsze pliki

- `astro.config.mjs` — integracje, konfiguracja bazy witryny oraz warunkowe wstrzykiwanie adaptera Vercel i trasy API Keystatica.
- `keystatic.config.ts` — pola edytora treści oraz warunkowy tryb magazynu (`github` na Vercelu, `local` w dev/CI).
- `src/server/keystatic-api.ts` — dedykowany handler proxy OAuth dla Keystatic na Vercelu (wstrzykiwany przez `injectRoute`).
- `src/env.d.ts` — deklaracje typów TypeScript dla bibliotek zewnętrznych i zmiennych procesowych.
- `src/content.config.ts` — loader i typowany schemat wpisu.
- `src/pages/index.astro` — agregacja i serializacja wiadomości.
- `src/components/InteractiveFeed.tsx` — wyszukiwarka i filtry.
- `src/pages/wpis/[slug].astro` — generowanie pojedynczych artykułów.
- `scripts/daily-digest.mjs` — pobieranie RSS, walidacja AI i zapis wpisów.
- `.github/workflows/daily-digest.yml` — codzienny job redakcyjny.
- `.github/workflows/deploy.yml` — kompilacja i GitHub Pages.
- `src/lib/constants.ts` — nazwy i style miast oraz kategorii.
- `src/content/settings/archive.json` — plik konfiguracyjny okresu archiwizacji (domyślnie 10 dni).
- `scripts/archive-worker.mjs` — nocny worker automatycznej archiwizacji (02:00 Europe/Warsaw).
- `.github/workflows/archive-worker.yml` — harmonogram GitHub Actions dla workera.
- `src/pages/archiwum.astro` — podstrona publiczna sekcji „Archiwum”.
- `src/pages/admin/archive.astro` — dedykowany panel administracyjny sekcji „Archive”.
- `src/components/ArchiveButton.tsx` — przycisk z ikoną „A” do manualnej archiwizacji na kafelkach wpisów.
- `src/components/admin/ArchiveAdminDashboard.tsx` — interaktywny dashboard administracyjny.
- `src/server/archive-api.ts` & `src/server/archive-service.ts` — endpoint i serwis aktualizacji flagi w Markdown.
- `src/server/archive-settings-api.ts` & `src/server/archive-run-api.ts` — endpointy konfiguracji i wyzwalania workera.
- `scripts/test-archive-all.mjs` — nadrzędny skrypt weryfikujący wszystkie kryteria akceptacji modułu archiwizacji.

## 13. Moduł Archiwizacji (Archive Module)

Moduł archiwizacji odpowiada za zarządzanie cyklem życia treści w serwisie Co Tam KATO, umożliwiając automatyczne lub ręczne ukrywanie nieaktualnych wpisów z widoku głównego serwisu i przenoszenie ich do dedykowanej sekcji „Archiwum”.

### 13.1. Model danych i rozszerzenie schematu (Frontmatter)

Schemat artykułów w `src/content.config.ts` oraz `keystatic.config.ts` został rozszerzony o dwa pola logiczne:
- `archived` (`z.boolean().default(false)`): flaga oznaczająca, czy artykuł znajduje się obecnie w archiwum (`true`), czy w bieżącym obiegu na stronie głównej (`false`).
- `manualOverride` (`z.boolean().default(false)`): flaga chroniąca artykuł przed automatyczną archiwizacją przez nocnego workera w przypadku, gdy moderator ręcznie przywrócił starszy artykuł na stronę główną.

### 13.2. Widok i nawigacja sekcji „Archiwum” (US 1)

1. **Pozycja w menu**: W górnym pasku nawigacyjnym (`src/components/Header.astro`) znajduje się odnośnik **„Archiwum”**, usytuowany ściśle pomiędzy pozycjami **„Dla Dzieci (4-10)”** a **„O serwisie”**. Dodatkowy link umieszczono w stopce serwisu.
2. **Podstrona `/archiwum`** (`src/pages/archiwum.astro`):
   - Komponent `InteractiveFeed` otrzymuje zbiór wszystkich nieusuniętych artykułów i dynamicznie ewaluuje ich stan archiwizacji (`isArchiveView={true}`).
   - W widoku domyślnym prezentowane są wyłącznie artykuły z flagą `archived: true` (z bazy danych lub zaktualizowane ręcznie przez użytkownika w bieżącej sesji).
   - Układ siatki kafelków, responsywność i stylistyka są w 100% spójne ze stroną główną i sekcją Ulubione.
   - Wpisy z `archived: true` są automatycznie odfiltrowywane ze strony głównej (`/`) oraz sekcji dziecięcej (`/dla-dzieci`).
3. **Relacja z sekcją Ulubione**: Zarchiwizowanie wpisu nie wpływa na stan polubienia. Artykuł oznaczony jako ulubiony i zarchiwizowany jest równocześnie dostępny w sekcji „Ulubione” oraz „Archiwum”.
4. **Stan pusty (Empty State)**: W przypadku braku zarchiwizowanych treści wyświetla się dedykowany komunikat informacyjny („Brak zarchiwizowanych artykułów”). Jeśli w archiwum są artykuły, lecz żaden nie pasuje do filtrów (np. miasto/kategoria), wyświetlany jest dedykowany komunikat o braku wyników z przyciskiem resetu.
5. **Sortowanie i paginacja**: Domyślne sortowanie od najnowszych publikacji z obsługą infinite scroll i stronicowania (`pageSize: 12`).

### 13.3. Manualna archiwizacja i przywracanie z kafelka (US 2)

1. **Przycisk z ikoną „A” (`ArchiveButton.tsx`)**:
   - Umieszczony bezpośrednio obok ikony serduszka („Ulubione”) na każdym kafelku artykułu (oraz w nagłówku i stopce widoku szczegółowego wpisu `/wpis/[slug]`).
   - Posiada estetyczną ikonę pudełka ze stylizowaną literą „A” oraz tooltipy: *„Przenieś do archiwum”* lub *„Przywróć z archiwum”*.
   - W widoku Archiwum oraz dla zarchiwizowanych artykułów w Ulubionych ikona przyjmuje wyróżniony stan aktywny (indygo/bursztyn).
2. **Optymistyczna synchronizacja UI**: Kliknięcie przycisku błyskawicznie aktualizuje stan kafelka w przeglądarce (`localStorage` klucz `kato_manual_archives_v1`, zdarzenia `kato:archive-changed`). Artykuł natychmiast znika ze strony głównej i pojawia się w widoku `/archiwum`.
3. **Aktualizacja plików i odporność API (`src/server/archive-service.ts` & `src/server/archive-api.ts`)**:
   - Lokalnie: endpoint `/api/archive` bezpośrednio modyfikuje frontmatter w `src/content/news/[slug].md`, ustawiając `archived: true/false`.
   - Na platformie chmurowej (np. Vercel Serverless, gdzie system plików jest w trybie read-only): serwis bezpiecznie obsługuje błędy zapisu na dysku i w przypadku dostępności tokena (`GITHUB_TOKEN` lub sesja Keystatic) tworzy commit przez GitHub REST API. W przypadku braku tokena backend potwierdza pomyślne utrwalenie w sesji klienta (HTTP 200), zapobiegając błędom 500 EROFS.
4. **Ochrona ManualOverride**: Gdy użytkownik ręcznie przywraca z archiwum artykuł starszy niż skonfigurowana liczba dni retencji, wpis otrzymuje flagę `manualOverride: true`, co blokuje jego ponowną archiwizację przez nocny proces.
5. **Feedback w UI**: Toast/snackbar z informacją o przeniesieniu/przywróceniu wraz z przyciskiem **„Cofnij”** (Undo).

### 13.4. Nocny worker automatycznej archiwizacji (US 3)

1. **Skrypt wykonawczy (`scripts/archive-worker.mjs`)**:
   - Sprawdza lokalną godzinę w strefie czasowej `Europe/Warsaw` za pomocą `Intl.DateTimeFormat`.
   - Zapewnia pełną zgodność ze zmianami czasu w Polsce (czas letni CEST oraz czas zimowy CET), startując o 02:00 czasu lokalnego.
   - Pobiera liczbę dni retencji z pliku `src/content/settings/archive.json` (fallback ze zmiennej `ARCHIVE_AFTER_DAYS` lub domyślnie 10 dni).
2. **Kryteria kwalifikacji do archiwum**:
   - `archived === false`
   - `manualOverride === false`
   - `status !== 'deleted'`
   - Wiek artykułu liczony od daty publikacji (`sourceDate` lub `pubDate`) jest ściśle większy niż zadany okres (`diffDays > archiveAfterDays`).
3. **Automatyzacja GitHub Actions (`.github/workflows/archive-worker.yml`)**:
   - Harmonogram cron: `00:00 UTC` oraz `01:00 UTC`, co gwarantuje precyzyjne trafienie w godzinę 02:00 czasu polskiego zarówno latem (UTC+2), jak i zimą (UTC+1).
   - Opcja ręcznego uruchomienia przez `workflow_dispatch`.
   - Automatyczny commit zmian do gałęzi `main` w przypadku zarchiwizowania wpisów.
4. **Logowanie i idempotentność**:
   - Wszystkie zdarzenia i podsumowania są zapisywane w pliku `logs/archive-worker.log`.
   - Ponowne uruchomienie workera tego samego dnia nie modyfikuje niepotrzebnie plików ani danych (operacja w pełni idempotentna).

### 13.5. Konfiguracja retencji i panel zarządzania „Archive” (US 4)

1. **Sekcja w Keystatic CMS (`keystatic.config.ts`)**:
   - Zdefiniowany singleton `archive` z etykietą **`Archive`**.
   - Pole `archiveAfterDays` typu integer z etykietą *„Okres archiwizacji (w dniach)”*, wartością domyślną 10 oraz walidacją `{ min: 1, max: 365 }`.
   - Kolumna `archived` w tabeli listy kolekcji artykułów (`columns: [..., 'archived', ...]`), informująca jednoznacznie o statusie wpisu.
2. **Dedykowany panel administracyjny `/admin/archive` (`src/pages/admin/archive.astro`)**:
   - Komponent `ArchiveAdminDashboard.tsx` z nowoczesnym interfejsem graficznym.
   - **Formularz konfiguracji retencji**: Pole numeryczne z natychmiastową walidacją (blokada zera, liczb ujemnych, ułamków, tekstu, wartości > 365 dni i pustych pól). Zapis do `src/content/settings/archive.json` via POST `/api/archive-settings`.
   - **Przycisk „Uruchom teraz (Przelicz archiwum)”**: Wyzwala worker archiwizacji na żądanie via POST `/api/archive-run` i natychmiast renderuje kartę raportu (liczba przeskanowanych, nowo zarchiwizowanych wpisów, wpisów chronionych przez override oraz czas operacji).
   - **Tabela artykułów z flagą `Archived (True / False)`**: Pełne zestawienie wpisów z wyszukiwarką, filtrami (Wszystkie, Główna, Archiwum, Override), czytelnymi badge'ami statusu oraz przyciskiem do natychmiastowej zmiany flagi każdego artykułu.
3. **Plik konfiguracyjny**: `src/content/settings/archive.json`:
   ```json
   {
     "archiveAfterDays": 10
   }
   ```

### 13.6. Testy i weryfikacja automatyczna

Dla całego modułu archiwizacji przygotowano zestaw skryptów testowych weryfikujących 100% kryteriów akceptacji:
- `node scripts/test-archive-us1.mjs` — testy widoku `/archiwum`, menu, pustych stanów, filtrowania i paginacji (US 1).
- `node scripts/test-archive-us2.mjs` — testy przycisku „A”, aktualizacji w plikach, odwracalności i flagi `manualOverride` (US 2).
- `node scripts/test-archive-us3.mjs` — testy nocnego workera, stref czasowych, idempotentności i logów (US 3).
- `node scripts/test-archive-us4.mjs` — testy sekcji Keystatic Archive, walidacji 1..365, panelu `/admin/archive` i wyzwalania na żądanie (US 4).
- `node scripts/test-archive-all.mjs` — zbiorczy runner wykonujący pełen zestaw testów:
  ```bash
  node scripts/test-archive-all.mjs
  ```

