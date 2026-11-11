# Specyfikacja: równowaga kategorii w Agencie AI (Co Tam KATO)

Wersja: 1.0 (11.11.2026). Status: **zatwierdzona do wdrożenia**.
Kontekst i dane: analiza_rownowagi_kategorii.md
Kopia w repozytorium (tworzona w Prompcie 1): `docs/rownowaga-tresci.md`

---

## 0. Decyzje właściciela produktu (wiążące)

| # | Decyzja |
|---|---|
| D1 | Docelowy udział **grupy biletowanej** (NOSPR, Teatr Śląski, Teatr Rozrywki, Spodek) w artykułach bota: **30–40%**. NOSPR ok. 12–20%. |
| D2 | Wpisy zbiorcze (tygodniowe) są **wyłącznie dodatkowym podsumowaniem**. **Nie zastępują** pojedynczych artykułów i **nie wliczają się** do kwot. Cel: nie przegapić wydarzeń, na które są jeszcze bilety. |
| D3 | Teatr Śląski dostaje **osobną kategorię** `teatr-slaski` (etykieta „Teatr Śląski”). |
| D4 | Ochrona przed odwrotnym efektem: **gwarantowane minimum** (≥1 wpis z grupy biletowanej dziennie, gdy jest materiał) i pierwszeństwo dla „Ostatnich biletów”. |

---

## 1. Słownik

- **Grupa biletowana (`ticketed`)**: artykuły z `venueGroup` ∈ {`nospr`, `teatr-slaski`, `teatr-rozrywki`, `spodek`}.
- **`venueGroup`**: klasyfikacja artykułu lub kandydata po obiekcie. Kolejność reguł (pierwsza pasująca wygrywa):
  1. `nospr`: `sourceUrl` zawiera `nospr.org.pl` LUB `location` zawiera `nospr` LUB `sourceName` zawiera `nospr`
  2. `spodek`: `spodekkatowice.pl` / `spodek`
  3. `teatr-rozrywki`: `teatr-rozrywki.pl` / `teatr rozrywki`
  4. `teatr-slaski`: `teatrslaski.art.pl` / `teatr śląski` / `teatr slaski` (**nie** samo „śląski”: Stadion Śląski, Park Śląski, Muzeum Śląskie to NIE teatr)
  5. w pozostałych przypadkach `other`
- **Dzień**: dzień kalendarzowy w strefie `Europe/Warsaw`. Datą dodania artykułu jest **prefiks nazwy pliku** `YYYY-MM-DD-…` (nadawany przez `writeArticle` = dzień uruchomienia). **Nie** używać `publishedDate`, bo ta może być datą źródłową.
- **Artykuł liczony do statystyk**: `aiGenerated: true`, `status` ≠ `deleted`, **nie** jest wpisem zbiorczym (§6).
- **Kandydat pilny (`urgent`)**: pozycja z grupy biletowanej ze statusem „Ostatnie bilety” / „Ostatnie wolne miejsca” i `eventDate` w ciągu ≤ 14 dni.

---

## 2. Parametry (konfigurowalne w `config/sources.md`)

Nowa sekcja w `config/sources.md`, analogiczna do „Ustawienia wyświetlania i paginacji” (ten sam styl `- \`klucz\`: wartość`). Parser i domyślne wartości w `scripts/sources-parser.mjs` (wzorzec: `DEFAULT_PAGINATION_SETTINGS` / `parsePaginationSettings`).

```markdown
## Ustawienia równowagi treści (Agent AI)

- `ticketedMaxPerRun`: 2
- `ticketedMaxPerDay`: 3
- `ticketedMinPerDay`: 1
- `ticketedMaxShare3d`: 0.40
- `nosprMaxPerRun`: 1
- `nosprMaxPerDay`: 2
- `otherVenueMaxPerDay`: 1
- `lastTicketsBonusPerDay`: 1
- `maxCandidates`: 7
- `poolMaxItemsPerTicketedSource`: 5
- `cycleCooldownDays`: 7
- `weeklySummaryEnabled`: true
- `weeklySummaryHorizonDays`: 14
```

| Klucz | Znaczenie |
|---|---|
| `ticketedMaxPerRun` | maks. artykułów z grupy biletowanej w jednym uruchomieniu |
| `ticketedMaxPerDay` | maks. artykułów z grupy w danym dniu (łącznie ze wszystkich uruchomień) |
| `ticketedMinPerDay` | minimum dzienne; gdy dziś jeszcze 0, uruchomienie **musi** wybrać ≥1, jeśli jest kandydat |
| `ticketedMaxShare3d` | jeśli udział grupy w ostatnich 3 dniach (dziś + 2 poprzednie) > progu i dziś już jest ≥1 wpis, budżet uruchomienia = 0 (poza bonusem pilnym) |
| `nosprMaxPerRun` / `nosprMaxPerDay` | limity dla samego NOSPR |
| `otherVenueMaxPerDay` | limit dzienny dla **każdego** z: `teatr-slaski`, `teatr-rozrywki`, `spodek` |
| `lastTicketsBonusPerDay` | ile dodatkowych wpisów `urgent` dziennie może przekroczyć `ticketedMaxPerDay` / próg udziału (ochrona D2/D4) |
| `maxCandidates` | ile kandydatów w kolejności ważności zwraca Gemini (zamiast maks. 4) |
| `poolMaxItemsPerTicketedSource` | maks. pozycji z jednego źródła biletowanego w puli promptu |
| `cycleCooldownDays` | maks. 1 artykuł z tego samego cyklu (np. „JazzKLUB”) w tym oknie |
| `weeklySummaryEnabled` / `weeklySummaryHorizonDays` | wpis zbiorczy (§6) |

Walidacja: liczby całkowite ≥ 0 (share: 0–1). Wartości błędne lub brakujące zastępowane są domyślnymi z ostrzeżeniem w logu. Zapis z panelu admina (`src/server/sources-service.ts`) **musi zachować** tę sekcję bez zmian.

---

## 3. Algorytm budżetu (funkcja czysta, testowalna)

```text
computeBalanceBudget(existingArticles, settings, now) -> {
  ticketedAllowed, nosprAllowed, perVenueAllowed{teatr-slaski,teatr-rozrywki,spodek},
  floorRequired (bool), urgentBonusAvailable (int), stats{today, last3d, byCategory7d}
}
```

1. `today` = liczniki per `venueGroup` dla artykułów z prefiksem pliku = dzisiejsza data.
2. `share3d` = ticketed / wszystkie z ostatnich 3 dni (gdy wszystkich < 4, ignoruj próg udziału).
3. `ticketedAllowed` = `min(ticketedMaxPerRun, ticketedMaxPerDay − today.ticketed)`, nie mniej niż 0.
4. Jeśli `share3d > ticketedMaxShare3d` i `today.ticketed ≥ 1`, to `ticketedAllowed = 0`.
5. `floorRequired` = `today.ticketed < ticketedMinPerDay`. Wtedy `ticketedAllowed = max(ticketedAllowed, 1)`.
6. `nosprAllowed` = `min(nosprMaxPerRun, nosprMaxPerDay − today.nospr, ticketedAllowed)`.
7. `perVenueAllowed[v]` = `min(otherVenueMaxPerDay − today[v], ticketedAllowed)`.
8. `urgentBonusAvailable` = `lastTicketsBonusPerDay − (dzisiejsze wpisy użyte jako bonus)`. Wpisy bonusowe rozpoznawane są po tym, że przekroczyły limit. Prościej: licz `today.ticketed − ticketedMaxPerDay` jeśli > 0.

## 4. Wybór finalnych artykułów (egzekwowanie w kodzie)

```text
selectBalancedArticles(rankedCandidates, budget, settings) -> { accepted[], rejected[{article, reason}] }
```

- Wejście: kandydaci po `validateArticle` i filtrze usuniętych, **w kolejności zwróconej przez Gemini** (ranking ważności), przed `resolveCandidateArticles`.
- Uwaga: deduplikacja (`resolveCandidateArticles`) wykonuje się **przed** wyborem kwotowym, żeby duplikat nie zajmował slotu. Kolejność: validate, filtr usuniętych, `resolveCandidateArticles` (duplikaty), `selectBalancedArticles`, `writeArticle`.
- Pętla po kandydatach, maks. `MAX_ARTICLES` (4) zaakceptowanych:
  - `other`: akceptuj.
  - ticketed: akceptuj, jeśli mieści się w `ticketedAllowed` i limicie obiektu (`nosprAllowed` / `perVenueAllowed`). W przeciwnym razie, jeśli kandydat jest `urgent` i `urgentBonusAvailable > 0`, akceptuj jako bonus (log `bonus: ostatnie bilety`). W pozostałych przypadkach odrzuć (`limit równowagi: <venue>`).
  - Maks. 1 artykuł z tego samego `venueGroup` ≠ `other` w uruchomieniu (już wynika z limitów NOSPR=1 i obiektów=1/dzień).
- **Minimum**: jeśli `floorRequired` i nie zaakceptowano żadnego ticketed, a istnieje ticketed kandydat (najlepiej `urgent`, potem pierwszy w rankingu), to **zamień** ostatni zaakceptowany `other` na tego kandydata (albo dodaj, jeśli < 4).
- **Brak dopychania**: jeśli po pętli < 4 artykułów, a zostali wyłącznie kandydaci ticketed ponad limit, **nie** przekraczaj limitu. Lepiej opublikować mniej.
- Każda decyzja logowana: `⚖️ Równowaga: przyjęto [nospr] …`, `⚖️ Pominięto (limit nospr 2/dzień): …`.

`MAX_ARTICLES` zostaje = 4 (limit publikacji na uruchomienie). Nowa stała `MAX_CANDIDATES` (domyślnie z `maxCandidates` = 7) zastępuje sprawdzenie w `main()` (`proposed.length > MAX_ARTICLES` → błąd). Teraz błąd tylko gdy `> MAX_CANDIDATES`; nadmiar ponad `MAX_CANDIDATES` przycinany z ostrzeżeniem zamiast przerwania.

## 5. Prompt i pula (sygnał zamiast sztywnych reguł)

### 5.1 Prompt (`analyzeWithGemini`)
- **Usunąć** cały blok „PRIORYTET REDAKCYJNY – WCZESNE OSTRZEGANIE O BILETACH” z frazami „co najmniej 1–2” i „Najwyższy priorytet … ma NOSPR”.
- **Dodać** dynamiczny blok generowany z `computeBalanceBudget`:

```text
RÓWNOWAGA TEMATYCZNA (dane z systemu, obowiązujące):
- Zwróć do ${MAX_CANDIDATES} kandydatów posortowanych od najważniejszego. System opublikuje maks. ${MAX_ARTICLES}.
- Instytucje biletowane (NOSPR, Teatr Śląski, Teatr Rozrywki, Spodek): w tym cyklu system przyjmie maks. ${ticketedAllowed} (NOSPR maks. ${nosprAllowed}).${floorRequired ? ' Dziś nie było jeszcze żadnego – umieść co najmniej 1 taki kandydat wysoko w rankingu (najlepiej z „Ostatnimi biletami”).' : ''}
- Wśród wydarzeń biletowanych preferuj: „Ostatnie bilety” > premiera / start sprzedaży / ogłoszenie sezonu > najbliższy termin.
- Opublikowane w ostatnich 3 dniach (wg kategorii): ${JSON.stringify(stats.byCategory3d)}. Preferuj kategorie niedoreprezentowane (np. dla-dzieci, sport, drogi-komunikacja, alerty, gastro), o ile materiał jest wartościowy i lokalny.
- W jednym zestawie nie więcej niż 1 kandydat z tego samego obiektu; staraj się, by kategorie były różne.
```

- Ostatnie zdanie wstępu („Wybierz maksymalnie ${MAX_ARTICLES} …”) zmienić na „Zaproponuj maksymalnie ${MAX_CANDIDATES} kandydatów … w kolejności ważności”.
- Lista kategorii w schemacie JSON: dodać `teatr-slaski` i wskazówkę („w Teatrze Śląskim „teatr-slaski””).

### 5.2 Flaga `highPriority`
- Ustawiać **tylko** dla: status „Ostatnie bilety” / „Ostatnie wolne miejsca”; tytuł lub opis z „premiera”, „prapremiera”, „start sprzedaży”, „ruszyła sprzedaż”, „sylwester”, „gala”, „festiwal”, „nowy sezon”; pozycje NOSPR – Aktualności o sprzedaży i sezonie.
- Zwykłe pozycje kalendarzy: bez flagi (pole `ticketStatus` zostaje, więc model nadal widzi dostępność).
- `isHighPriorityTicketSource` rozdzielić na: `isTicketedVenueItem(item)` (przynależność do grupy, do kwot i puli) oraz `isHighPriorityItem(item)` (wyjątkowość).

### 5.3 Pula (`selectPromptItems` / `interleaveWebItems`)
- `maxPriorityLeadItems`: z `min(12, quota/2)` na **`min(6, quota/4)`**; w lead tylko pozycje `highPriority`.
- Każde źródło ticketed: maks. `poolMaxItemsPerTicketedSource` (5) pozycji w puli. Kolejność wewnątrz źródła: `urgent` → `highPriority` → najbliższa data.
- Jeśli `ticketedAllowed === 0` i brak kandydatów `urgent`, pozycje ticketed ograniczyć do 2 na źródło (oszczędność tokenów; nadal widoczne dla deduplikacji/kontekstu).
- **Cykle**: wyodrębnić nazwę cyklu (pole „Cykl/kategoria” z parsera NOSPR i Teatru Śląskiego; prefiks tytułu przed „:” lub „/”, np. „JazzKLUB”). Jeśli w ostatnich `cycleCooldownDays` opublikowano artykuł z tym cyklem, pozycje tego cyklu pomijać w puli, chyba że są `urgent`.

## 6. Wpis zbiorczy „Tydzień w kulturze” (dodatkowy, D2)

- **Cel**: jeden wpis tygodniowo z listą **wszystkich** nadchodzących (`weeklySummaryHorizonDays` = 14 dni) wydarzeń z grupy biletowanej z dostępnymi biletami. Nic nie ucieka, nawet jeśli nie dostało osobnego artykułu.
- **Generowanie deterministyczne** (bez Gemini, zero halucynacji i tokenów) z danych parserów zebranych w tym samym uruchomieniu (`collectNews`).
- **Kiedy**: pierwsze **udane** uruchomienie w danym tygodniu ISO, począwszy od poniedziałku. Idempotencja: pomiń, jeśli w `src/content/news/` istnieje plik ze slugiem zawierającym `tydzien-w-kulturze` i prefiksem daty z bieżącego tygodnia ISO.
- **Format**:
  - tytuł: `Tydzień w kulturze: NOSPR, teatry i Spodek (DD.MM–DD.MM)`, więc slug ma postać `YYYY-MM-DD-tydzien-w-kulturze-…`
  - `category: "kultura"`, `city: "cala-okolica"`, `status: "published"`, `eventDate: null`, `isAlert: false`, `aiGenerated: true`, `archived: false`
  - `sourceUrl`: `https://nospr.org.pl/pl/kalendarz` (URL generyczny, ignorowany przez deduplikację)
  - `summary`: „Zestawienie N wydarzeń z dostępnymi biletami w NOSPR, Teatrze Śląskim, Teatrze Rozrywki i Spodku w najbliższych 14 dniach.”
  - treść: sekcje `### NOSPR`, `### Teatr Śląski`, `### Teatr Rozrywki`, `### Spodek`; w każdej lista posortowana po dacie: `- **DD.MM (dzień tyg.), godz. HH:MM** – [Tytuł](link) – sala/scena – *status biletów*`. Jeśli wydarzenie ma już osobny artykuł, dopisz ` · [nasz artykuł](/wpis/<slug>/)`. „Ostatnie bilety” wyróżnij (⚠️). Na końcu krótka notka, że lista jest generowana automatycznie z repertuarów.
  - Pomijaj wydarzenia bez daty i sekcje bez wydarzeń; jeśli łącznie < 3 wydarzenia, nie twórz wpisu.
- **Wyłączenia**: wpis zbiorczy **nie** wlicza się do statystyk ani kwot (§1), **nie** trafia do `coveredTopics` i **nie** blokuje deduplikacją pojedynczych artykułów.
- **Awaria Gemini**: wpis zbiorczy zapisz **przed** wywołaniem Gemini. Jeśli później Gemini rzuci wyjątek, workflow i tak nie scommituje (krok fail), a kolejne uruchomienie wygeneruje go ponownie (idempotencja po tygodniu). Zaakceptowane.

## 7. Kategoria `teatr-slaski` (D3)

Miejsca do zmiany (wzorzec: commit `64c784a`, który dodał `nospr`/`spodek`/`teatr-rozrywki`):
- `src/content.config.ts` → `CATEGORY_VALUES`
- `src/lib/constants.ts` → `CATEGORIES['teatr-slaski'] = { name: 'Teatr Śląski', iconName: …, badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }`
- `src/components/CategoryBadge.tsx` → ikona (np. `Theater` z `lucide-react`; sprawdzić, czy eksport istnieje w zainstalowanej wersji, w razie braku `VenetianMask` / `Drama`)
- `keystatic.config.ts` → opcja `{ label: 'Teatr Śląski Katowice', value: 'teatr-slaski' }`
- `scripts/daily-digest.mjs` → `ALLOWED_CATEGORIES`, lista kategorii w promptcie, wymuszanie kategorii w `validateArticle` (oba bloki: L2247–2256 i L2305–2315) według reguł `venueGroup` z §1
- **Migracja** istniejących wpisów: pliki w `src/content/news/` z `sourceUrl` zawierającym `teatrslaski.art.pl` LUB `location` zawierającym (bez względu na wielkość liter) `teatr śląski` / `teatr slaski`, z kategorią `kultura` lub `wydarzenia`. Zmienić tylko linię `category:` (archiwalne też). Kodowanie UTF-8 bez BOM, końce linii jak w oryginale.
- Testy: `scripts/test-priority-venues.mjs` (sekcja 7) rozszerzyć o Teatr Śląski.
- Dokumentacja: `DOKUMENTACJA.md` (model treści, kategorie), `README.md`, jeśli wymienia kategorie.

## 8. Monitoring

- Na końcu `main()` loguj: `📊 Rozkład dziś: …; 3 dni: ticketed X/Y (Z%); NOSPR …`.
- Skrypt `scripts/report-balance.mjs [--days 14]`: tabela kategorii i `venueGroup` per dzień oraz udział ticketed, na podstawie plików w `src/content/news/` (prefiks daty, `aiGenerated: true`, bez wpisów zbiorczych). Bez sieci i bez zapisu.

## 9. Kryteria akceptacji

1. `node scripts/test-category-balance.mjs` przechodzi i pokrywa: limity per uruchomienie, dzień i obiekt; próg udziału 3d; minimum (zamiana); bonus `urgent`; brak dopychania; wykluczenie wpisu zbiorczego; parser ustawień z wartościami domyślnymi i błędnymi.
2. **Replay historyczny** (test z fixture zbudowanym z rzeczywistego rozkładu 01–11.11: 26 uruchomień, kandydaci w kolejności z historii plus syntetyczni `other` jako nadmiar): udział ticketed **30–40%**, NOSPR ≤ 20%, każdy dzień z ≥1 ticketed.
3. Wszystkie istniejące testy `scripts/test-*.mjs` przechodzą (zaktualizowane tam, gdzie zmienia się zamierzone zachowanie, np. asercja `highPriority` na pierwszych 5 pozycjach WEB).
4. `npm run build` przechodzi (Astro + schema z `teatr-slaski`).
5. `node scripts/daily-digest.mjs --dry-run` działa i loguje budżet równowagi.
6. Po 5–7 dniach produkcji: `report-balance.mjs` pokazuje 30–40% ticketed i ≥1 dziennie (weryfikacja w Prompcie 6).
