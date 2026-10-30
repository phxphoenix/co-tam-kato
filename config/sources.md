# Baza Źródeł Wydarzeń – Katowice i Metropolia GZM (Single Source of Truth)

## Instrukcje operacyjne dla Agenta AI (Ingestion Pipeline)

1. **Filtrowanie:** Przetwarzaj wyłącznie wiersze, w których kolumna `Status` ma wartość `ACTIVE`. Ignoruj wiersze ze statusem `INACTIVE` lub `TEMPLATE`.
2. **Routing metody pobierania (Kolumna `Typ`):**
   - **`RSS`**: Pobierz strumień za pomocą parsera XML/Atom. Wyodrębnij pola `title`, `link`, `description` (lub `content:encoded`) oraz `pubDate`. **KRYTYCZNE:** Pole `pubDate` w RSS oznacza datę publikacji artykułu, a nie datę samego wydarzenia! Faktycznej daty i godziny wydarzenia szukaj wewnątrz treści (`description`/`title`).
   - **`WEB`**: Pobierz kod HTML strony docelowej, oczyść go ze zbędnych znaczników (nawigacja, stopki, skrypty) lub skonwertuj do formatu Markdown, a następnie wyodrębnij listę wydarzeń zgodnie z kolumną `Wskazówki dla agenta (Scraping Hints)`.
   - **`DYNAMIC_WEB`**: Strona renderowana po stronie klienta (SPA/JS). Wymaga użycia przeglądarki headless (np. Playwright/Puppeteer) lub narzędzia typu Jina Reader / Firecrawl z oczekiwaniem na wyrenderowanie DOM przed ekstrakcją tekstu.
3. **Izolacja błędów:** W przypadku błędu sieciowego (np. HTTP 403/404/500, timeout) dla danego `ID`, zapisz ostrzeżenie w logach i bez przerywania pętli przejdź do kolejnego źródła z tabeli.
4. **Deduplikacja i normalizacja:** Każde wyodrębnione wydarzenie przypisz do domyślnej kategorii z kolumny `Kategoria` (chyba że z treści jasno wynika bardziej precyzyjna kategoria). Znormalizuj daty do formatu `ISO 8601` (`YYYY-MM-DD HH:mm`).

---

## Ustawienia wyświetlania i paginacji

- `homePageSize`: 36
- `archivePageSize`: 24
- `adminArchivePageSize`: 100

---

## Tabela Źródeł (Konfiguracja)

| ID | Nazwa | Typ | URL | Kategoria | Status | Wskazówki dla agenta (Scraping Hints) |
|---|---|---|---|---|---|---|
| 1 | PIK Katowice (Główne) | WEB | https://pik.katowice.pl/ | Kultura / Ogólne | ACTIVE | Główna lista nadchodzących wydarzeń. Wyciągaj: tytuł, dokładną datę (często przedział dat), nazwę obiektu (np. NOSPR, Spodek) oraz link do szczegółów. |
| 2 | wKatowicach.eu | WEB | https://www.wkatowicach.eu/kategoria/kultura-i-rozrywka | Miejskie / Rozrywka | ACTIVE | To lista artykułów. Zwracaj szczególną uwagę na artykuły zbiorcze ze słowami "Weekend w Katowicach" lub "Co robić w weekend" w tytule – zawierają one wewnątrz listę kilkunastu wydarzeń z godzinami. Dostępny jest także kanał RSS: https://www.wkatowicach.eu/rss. |
| 3 | Śląskie Travel | WEB | https://slaskie.travel/event/list | Regionalne / Plener | ACTIVE | Lista wydarzeń w województwie. Filtruj i zachowuj wyłącznie wydarzenia odbywające się w Katowicach oraz bezpośrednich miastach ościennych GZM (Chorzów, Sosnowiec, Tychy, Gliwice, Zabrze, Bytom, Mysłowice). |
| 4 | CoJestGrane24 Katowice | WEB | https://cojestgrane.pl/polska/slaskie/katowice | Kultura / Kluby | ACTIVE | Ustrukturyzowany katalog. Pobieraj karty wydarzeń: tytuł, kategoria podrzędna (teatr, koncert, impreza), miejsce, data i godzina rozpoczęcia. |
| 5 | Spodek Katowice | WEB | https://www.spodekkatowice.pl/pl/wydarzenia/61/ | Widowiska / Koncerty | ACTIVE | Bardzo czysta struktura kafelkowa. W projekcie istnieje dedykowany parser HTML (parseSpodekOrMck). Pobieraj: nazwę wydarzenia, datę (uwaga na wydarzenia wielodniowe), godzinę otwarcia bram oraz link do zakupu biletów. |
| 6 | MCK Katowice | WEB | https://www.mckkatowice.pl/pl/wydarzenia/61/ | Targi / Konferencje | ACTIVE | Bliźniacza struktura do Spodka. W projekcie istnieje sprawdzony parser HTML (parseSpodekOrMck; alternatywny URL: https://www.mckkatowice.pl/pl/wydarzenia/5/). Skup się na targach otwartych dla publiczności, festiwalach i kongresach. Pomiń zamknięte wydarzenia korporacyjne. |
| 7 | NOSPR (Kalendarz) | WEB | https://nospr.org.pl/pl/kalendarz | Muzyka / Klasyka | ACTIVE | Kalendarz koncertów i warsztatów. Wyciągaj: tytuł koncertu, wykonawców, datę, godzinę, salę (np. Sala koncertowa vs Sala kameralna) oraz informację, czy bilety są jeszcze dostępne (status "Wyprzedane"). |
| 8 | Muzeum Śląskie | WEB | https://muzeumslaskie.pl/warsztaty-spotkania-i-wydarzenia-cykliczne/ | Sztuka / Edukacja | ACTIVE | Wyodrębniaj wydarzenia jednorazowe i cykliczne (oprowadzania kuratorskie, warsztaty rodzinne, wykłady, wernisaże). Ignoruj godziny standardowego otwarcia kas biletowych. |
| 9 | Katowice Miasto Ogrodów | WEB | https://miasto-ogrodow.eu/ | Festiwale / Kultura | ACTIVE | Szukaj sekcji "Aktualności" oraz "Wydarzenia". Zwracaj uwagę na cykle festiwalowe (JazzArt, Ars Cameralis, koncerty w Strefie Kultury) oraz darmowe wejściówki. |
| 10 | Teatr Śląski | WEB | https://teatrslaski.art.pl/repertuar/ | Teatr | ACTIVE | Repertuar miesięczny. Pobieraj tytuł spektaklu, datę, godzinę oraz scenę (Duża Scena, Scena w Malarni, Scena Kameralna). Oznaczaj specjalnym tagiem premiery i spotkania wokół teatru. |
| 11 | Teatr Rozrywki Chorzów | WEB | https://teatr-rozrywki.pl/repertuar.html | Teatr / Musical | ACTIVE | Lokalizacja zawsze: Chorzów. Pobieraj spektakle musicalowe, koncerty gościnne oraz stand-upy z tabeli repertuaru wraz z godzinami i linkiem do rezerwacji. |
| 12 | Kinoteatr Rialto | WEB | https://kinoteatrrialto.bilety24.pl/repertuar/ | Kino / Koncerty | ACTIVE | Pobieraj repertuar ze szczególnym uwzględnieniem wydarzeń specjalnych: koncertów na żywo, pokazów kina niemego z muzyką na żywo oraz spotkań z twórcami. |
| 13 | Kino Kosmos | WEB | https://kosmos.katowice.pl/repertuar/ | Kino / Prelekcje | ACTIVE | Pomiń zwykłe, codzienne seanse kinowe bez dodatków. Wyciągaj: przeglądy filmowe, pokazy z prelekcją lub dyskusją, transmisje operowe oraz cykle dla dzieci i seniorów. |
| 14 | PIK Katowice – Dzieci | WEB | https://pik.katowice.pl/dzieci/ | Rodzina / Dzieci | ACTIVE | Wszystkie wydarzenia z tego źródła oznaczaj tagiem "Dla dzieci". Zwracaj uwagę na sugerowany wiek uczestników w opisie (np. "dla dzieci 3-6 lat"). |
| 15 | Teatr Ateneum | WEB | https://ateneumteatr.pl/ | Teatr / Dzieci | ACTIVE | Szukaj sekcji repertuaru. Wyciągaj spektakle lalkowe i familijne, daty, godziny (często poranne i weekendowe) oraz adres sceny (ul. Św. Jana 10 lub Galeria Ateneum). |
| 16 | Park Śląski | WEB | https://parkslaski.pl/aktualnosci | Plener / Sport / Rodzina | ACTIVE | Lokalizacja: Park Śląski (Chorzów/Katowice). Sekcja aktualności z dedykowanym parserem HTML w projekcie (parseParkSlaski). Wyciągaj tylko wpisy zapowiadające nadchodzące imprezy (biegi, pikniki, wystawy kwiatowe, spacery przyrodnicze). Ignoruj relacje z wydarzeń przeszłych. Alternatywny URL w kodzie: https://parkslaski.pl/en/news. |
| 17 | Planetarium Śląskie | WEB | https://www.planetarium.edu.pl/aktualnosci.html | Nauka / Rodzina | ACTIVE | Szukaj zapowiedzi wydarzeń specjalnych, obserwacji nieba, festiwali nauki i koncertów pod kopułą. |
| 18 | Crossweb Katowice | WEB | https://crossweb.pl/wydarzenia/katowice/ | Technologia / IT / Biznes | ACTIVE | Bardzo czysta lista wydarzeń IT. Pobieraj: nazwę meetupu/konferencji, datę, informację czy wydarzenie jest darmowe czy płatne oraz dokładną lokalizację w Katowicach. |
| 19 | GoingApp Katowice | DYNAMIC_WEB | https://goingapp.pl/polecamy/katowice | Kluby / Koncerty / Popkultura | ACTIVE | Strona oparta o JS. Pobieraj kafelki wydarzeń: artysta/tytuł, klub/miejsce (np. Królestwo, P23, Miasto Ogrodów), data i cena najtańszego biletu. |
| 20 | Biletomat Katowice | WEB | https://www.biletomat.pl/wydarzenia/w/katowice/ | Kluby / Alternatywa | ACTIVE | Lista biletowanych imprez klubowych i koncertów. Wyciągaj: nazwę imprezy, datę, lokalizację (często Strefa Centralna, Piąty Dom, Celna 10) oraz cenę biletu. |
| 21 | Stadion Śląski | WEB | https://superautostadionslaski.pl/wiadomosci | Sport / Widowiska | ACTIVE | Lokalizacja: Chorzów (Stadion Śląski). W projekcie istnieje dedykowany parser HTML (parseStadionSlaski). Pobieraj zapowiedzi imprez masowych, koncertów, meczów i biegów wraz z datą i linkiem do szczegółów. |
| 22 | mojeKatowice.pl | RSS | https://mojekatowice.pl/rss | Miejskie / Katowice | ACTIVE | Kanał RSS lokalnego portalu informacyjnego dla Katowic. Wyciągaj wiadomości miejskie, komunikaty, inwestycje oraz zapowiedzi wydarzeń w Katowicach z pól title, description i link. |
| 23 | Wydarzenia Metropolia GZM | RSS | https://metropoliagzm.pl/feed/ | Regionalne / Metropolia | ACTIVE | Oficjalny kanał RSS Górnośląsko-Zagłębiowskiej Metropolii. Wydarzenia regionalne, velostrady, transport publiczny, ekologia i inicjatywy metropolitalne w całej aglomeracji. |
| 24 | Śląska Opinia | RSS | https://slaskaopinia.pl/feed/ | Regionalne / Publicystyka i kultura | ACTIVE | Niezależny portal regionalny. Kanał RSS zawiera zapowiedzi wydarzeń społecznych, kulturalnych oraz informacje o inicjatywach obywatelskich na Śląsku i w Zagłębiu. |
| 25 | mojChorzow.pl | RSS | https://mojchorzow.pl/rss | Miejskie / Chorzów | ACTIVE | Kanał RSS portalu dla mieszkańców Chorzowa. Pobieraj wiadomości lokalne, wydarzenia kulturalne, rekreacyjne oraz komunikaty miejskie (Chorzów). |
| 26 | mojeTychy.pl | RSS | https://mojetychy.pl/rss | Miejskie / Tychy | ACTIVE | Kanał RSS portalu dla mieszkańców Tychów. Informacje lokalne, repertuary, wydarzenia miejskie, koncerty oraz informacje z życia Tychów. |
| 27 | mojBytom.pl | RSS | https://mojbytom.pl/rss | Miejskie / Bytom | ACTIVE | Kanał RSS portalu dla mieszkańców Bytomia. Informacje miejskie, kultura, teatr, sport, inicjatywy sąsiedzkie i wydarzenia w Bytomiu. |
| 28 | Silesion.PL | RSS | https://silesion.pl/feed/ | Regionalne / Wydarzenia | ACTIVE | Śląski portal informacyjny dla całej aglomeracji. Kanał RSS z aktualnościami, zapowiedziami koncertów, festiwali, wystaw i imprez plenerowych w regionie. |
| 29 | Gliwice.eu | RSS | https://gliwice.eu/rss.xml | Miejskie / Gliwice | ACTIVE | Oficjalny miejski kanał RSS Gliwic. Aktualności miejskie, zapowiedzi wydarzeń kulturalnych, sportowych i edukacyjnych w Gliwicach i zachodniej części GZM. |
