# Zasady i tryb pracy agenta (Workspace Rules)

## Autonomia i podejmowanie decyzji
- **Pełna autonomia działania**: Pracuj całkowicie niezależnie i proaktywnie. Realizuj powierzone zadania od początku do końca bez pytania o potwierdzenie na kolejnych etapach pośrednich.
- **Brak zbędnych pytań o zgodę**: Nie pytaj o zgodę przed edycją plików, tworzeniem nowych komponentów, instalacją zależności ani uruchamianiem poleceń budowania czy testów. Wykonuj te operacje automatycznie.
- **Samodzielne rozwiązywanie problemów**: Gdy napotkasz błąd (np. błąd kompilacji, brakujący typ, błąd testu), zdiagnozuj go i napraw od razu samodzielnie, testując wynik.
- **Kiedy pytać użytkownika**: Zwracaj się do użytkownika wyłącznie w przypadkach krytycznych, takich jak:
  - Konieczność podjęcia kluczowej decyzji biznesowej lub produktowej, której nie da się wywnioskować z projektu.
  - Wymagane zewnętrzne dane uwierzytelniające / klucze API.
  - Ryzyko nieodwracalnej utraty istotnych danych (np. destrukcyjne operacje na bazie/repozytorium bez kopii).
- **Komunikacja**: Po zakończeniu prac podsumuj krótko co zostało zrobione, jakie pliki zmieniono i jak zweryfikowano działanie.
