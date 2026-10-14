import { useState, useEffect, useCallback } from 'react';
import { AUTO_ARCHIVE_DAYS } from './constants.ts';

export interface ArchiveState {
  archived: boolean;
  manualOverride?: boolean;
}

const STORAGE_KEY = 'kato_manual_archives_v1';
const UPDATE_EVENT = 'kato_archive_changed';

/**
 * Pobiera z localStorage mapę manualnych zmian archiwizacji
 */
export function getStoredArchiveOverrides(): Record<string, ArchiveState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    console.warn('Nie udało się odczytać stanu archiwum z localStorage:', error);
    return {};
  }
}

/**
 * Zapisuje do localStorage i powiadamia wszystkie komponenty oraz karty
 */
export function saveArchiveOverrides(overrides: Record<string, ArchiveState>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: overrides }));
  } catch (error) {
    console.warn('Nie udało się zapisać stanu archiwum w localStorage:', error);
  }
}

/**
 * Sprawdza czy artykuł jest zarchiwizowany (biorąc pod uwagę stan bazowy i ewentualny override w przeglądarce)
 */
export function isItemArchived(slug: string, defaultArchived = false): boolean {
  const overrides = getStoredArchiveOverrides();
  if (slug in overrides) {
    return Boolean(overrides[slug].archived);
  }
  return Boolean(defaultArchived);
}

/**
 * Wykonuje asynchroniczne żądanie do backendu /api/archive w celu zaktualizowania pliku w bazie
 */
async function syncToBackend(slug: string, archived: boolean, manualOverride?: boolean): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return false;
  try {
    const rawBase = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const apiUrl = `${base}api/archive`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug, archived, manualOverride }),
    });

    if (!response.ok) {
      console.warn(`Backend /api/archive zwrócił status ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // W środowisku statycznym bez serwera fetch może zgłosić błąd połączenia - to normalne
    console.info('Backend /api/archive niedostępny w bieżącym środowisku runtime (zmiana zapisana lokalnie):', err);
    return false;
  }
}

/**
 * Przełącza status archiwizacji artykułu (Archive / Unarchive)
 * Zwraca nowy stan { archived, manualOverride }
 */
export function toggleItemArchive(options: {
  slug: string;
  defaultArchived?: boolean;
  defaultManualOverride?: boolean;
  pubDate?: string;
  sourceDate?: string;
}): ArchiveState {
  const { slug, defaultArchived = false, defaultManualOverride = false, pubDate, sourceDate } = options;
  const currentOverrides = getStoredArchiveOverrides();

  const isCurrentlyArchived = slug in currentOverrides
    ? currentOverrides[slug].archived
    : Boolean(defaultArchived);

  const nextArchived = !isCurrentlyArchived;
  let nextManualOverride = defaultManualOverride;

  // AC 4: Jeśli użytkownik ręcznie przywraca z archiwum artykuł starszy niż AUTO_ARCHIVE_DAYS,
  // otrzymuje on flagę manualOverride = true, aby nocny worker go nie zarchiwizował ponownie.
  if (!nextArchived) {
    const rawDate = sourceDate || pubDate;
    if (rawDate) {
      const articleTime = new Date(rawDate).getTime();
      const now = Date.now();
      const daysOld = (now - articleTime) / (1000 * 60 * 60 * 24);
      if (daysOld >= AUTO_ARCHIVE_DAYS) {
        nextManualOverride = true;
      }
    } else {
      nextManualOverride = true;
    }
  }

  const newState: ArchiveState = {
    archived: nextArchived,
    manualOverride: nextManualOverride,
  };

  const nextOverrides = {
    ...currentOverrides,
    [slug]: newState,
  };

  saveArchiveOverrides(nextOverrides);

  // Synchronizacja w tle z backendem / plikami bazy
  syncToBackend(slug, nextArchived, nextManualOverride).catch(() => {});

  return newState;
}

/**
 * Ręczne ustawienie stanu archiwizacji (np. przy operacji "Cofnij")
 */
export function setItemArchiveState(slug: string, state: ArchiveState): void {
  const currentOverrides = getStoredArchiveOverrides();
  const nextOverrides = {
    ...currentOverrides,
    [slug]: state,
  };
  saveArchiveOverrides(nextOverrides);
  syncToBackend(slug, state.archived, state.manualOverride).catch(() => {});
}

/**
 * Hook React do obserwacji stanu archiwizacji
 */
export function useArchive() {
  const [overrides, setOverrides] = useState<Record<string, ArchiveState>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setOverrides(getStoredArchiveOverrides());
    setIsLoaded(true);

    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, ArchiveState>>;
      if (customEvent.detail) {
        setOverrides(customEvent.detail);
      } else {
        setOverrides(getStoredArchiveOverrides());
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setOverrides(getStoredArchiveOverrides());
      }
    };

    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const getStatus = useCallback(
    (slug: string, defaultArchived = false) => {
      if (slug in overrides) {
        return overrides[slug].archived;
      }
      return Boolean(defaultArchived);
    },
    [overrides]
  );

  return {
    overrides,
    getStatus,
    toggleArchive: toggleItemArchive,
    setArchiveState: setItemArchiveState,
    isLoaded,
  };
}
