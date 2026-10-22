import { useState, useEffect, useCallback } from 'react';
import { AUTO_ARCHIVE_DAYS } from './constants.ts';

export interface ArchiveState {
  archived: boolean;
  manualOverride?: boolean;
  publishedDate?: string;
  persisted?: 'fs' | 'github' | 'client';
  updatedAt?: number;
}

export interface ArchiveSyncResult {
  slug: string;
  archived: boolean;
  persisted: 'fs' | 'github' | 'client';
}

const STORAGE_KEY = 'kato_manual_archives_v1';
const UPDATE_EVENT = 'kato_archive_changed';
export const SYNC_RESULT_EVENT = 'kato_archive_sync_result';

let serverStatesCache: Record<string, ArchiveState> = {};
let lastServerFetchAt = 0;
let inFlightServerFetch: Promise<Record<string, ArchiveState>> | null = null;

function getApiUrl(): string {
  const rawBase = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${base}api/archive`;
}

/**
 * Pobiera z localStorage mapę manualnych zmian archiwizacji
 */
export function getStoredArchiveOverrides(): Record<string, ArchiveState> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Jednostronny fallback przy odczycie z localStorage dla starszych zapisanych stanów (publishedDate ?? pubDate)
    const normalized: Record<string, ArchiveState> = {};
    for (const [slug, val] of Object.entries(parsed)) {
      if (val && typeof val === 'object') {
        const entry = val as Record<string, any>;
        normalized[slug] = {
          ...entry,
          archived: Boolean(entry.archived),
          ...(entry.publishedDate ?? entry.pubDate
            ? { publishedDate: entry.publishedDate ?? entry.pubDate }
            : {}),
        };
      }
    }
    return normalized;
  } catch (error) {
    console.warn('Nie udało się odczytać stanu archiwum z localStorage:', error);
    return {};
  }
}

/**
 * Zapisuje do localStorage i powiadamia wszystkie komponenty oraz karty
 */
export function saveArchiveOverrides(overrides: Record<string, ArchiveState>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: overrides }));
    }
  } catch (error) {
    console.warn('Nie udało się zapisać stanu archiwum w localStorage:', error);
  }
}

/**
 * Synchronizuje stan lokalny z aktualnym stanem na serwerze (/api/archive GET).
 * Dzięki temu zmiany wykonane na telefonie są od razu widoczne na komputerze
 * (nawet przed zakończeniem pełnego przebudowania statycznego HTML na Vercelu).
 */
export async function fetchServerArchiveStates(force = false): Promise<Record<string, ArchiveState>> {
  if (typeof window === 'undefined' || typeof window.location === 'undefined' || typeof fetch === 'undefined') {
    return serverStatesCache;
  }

  const now = Date.now();
  if (!force && inFlightServerFetch) {
    return inFlightServerFetch;
  }
  if (!force && now - lastServerFetchAt < 3000) {
    return serverStatesCache;
  }

  inFlightServerFetch = (async () => {
    try {
      const response = await fetch(getApiUrl(), {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) {
        return serverStatesCache;
      }

      const data = await response.json();
      if (data && data.success && data.states && typeof data.states === 'object') {
        const remoteStates = data.states as Record<string, ArchiveState>;
        serverStatesCache = remoteStates;
        lastServerFetchAt = Date.now();

        const localOverrides = getStoredArchiveOverrides();
        let changed = false;
        const mergedOverrides: Record<string, ArchiveState> = { ...localOverrides };

        for (const [slug, remoteState] of Object.entries(remoteStates)) {
          const local = mergedOverrides[slug];
          const remoteTime = remoteState.updatedAt || 0;
          const localTime = local?.updatedAt || 0;

          // Jeśli na tym urządzeniu nie było lokalnego wpisu, albo wpis na serwerze jest nowszy,
          // albo lokalny wpis był już wcześniej zsynchronizowany z serwerem — przyjmujemy stan z serwera
          if (
            !local ||
            (remoteTime > 0 && remoteTime >= localTime) ||
            local.persisted === 'github' ||
            local.persisted === 'fs'
          ) {
            if (
              !local ||
              local.archived !== remoteState.archived ||
              local.manualOverride !== remoteState.manualOverride
            ) {
              mergedOverrides[slug] = {
                archived: Boolean(remoteState.archived),
                manualOverride: remoteState.manualOverride,
                persisted: 'github',
                updatedAt: remoteTime || Date.now(),
              };
              changed = true;
            }
          }
        }

        if (changed) {
          saveArchiveOverrides(mergedOverrides);
        } else if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: mergedOverrides }));
        }
      }
      return serverStatesCache;
    } catch {
      return serverStatesCache;
    } finally {
      inFlightServerFetch = null;
    }
  })();

  return inFlightServerFetch;
}

/**
 * Sprawdza czy artykuł jest zarchiwizowany (biorąc pod uwagę stan bazowy, serwer i ewentualny override w przeglądarce)
 */
export function isItemArchived(slug: string, defaultArchived = false): boolean {
  const overrides = getStoredArchiveOverrides();
  if (slug in overrides) {
    return Boolean(overrides[slug].archived);
  }
  if (slug in serverStatesCache) {
    return Boolean(serverStatesCache[slug].archived);
  }
  return Boolean(defaultArchived);
}

/**
 * Wykonuje asynchroniczne żądanie do backendu /api/archive w celu zaktualizowania pliku w bazie
 */
async function syncToBackend(
  slug: string,
  archived: boolean,
  manualOverride?: boolean
): Promise<'fs' | 'github' | 'client'> {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return 'client';
  try {
    const response = await fetch(getApiUrl(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug, archived, manualOverride }),
    });

    if (!response.ok) {
      console.warn(`Backend /api/archive zwrócił status ${response.status}`);
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent<ArchiveSyncResult>(SYNC_RESULT_EVENT, {
            detail: { slug, archived, persisted: 'client' },
          })
        );
      }
      return 'client';
    }

    const data = await response.json().catch(() => ({}));
    const persisted: 'fs' | 'github' | 'client' =
      data?.persisted === 'github' || data?.persisted === 'fs' ? data.persisted : 'client';

    // Zaktualizuj status utrwalenia w localStorage
    const currentOverrides = getStoredArchiveOverrides();
    if (slug in currentOverrides) {
      currentOverrides[slug] = {
        ...currentOverrides[slug],
        persisted,
        updatedAt: Date.now(),
      };
      saveArchiveOverrides(currentOverrides);
    }

    serverStatesCache[slug] = {
      archived,
      manualOverride,
      persisted,
      updatedAt: Date.now(),
    };

    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<ArchiveSyncResult>(SYNC_RESULT_EVENT, {
          detail: { slug, archived, persisted },
        })
      );
    }

    return persisted;
  } catch (err) {
    // W środowisku statycznym bez serwera fetch może zgłosić błąd połączenia - to normalne
    console.info('Backend /api/archive niedostępny w bieżącym środowisku runtime (zmiana zapisana lokalnie):', err);
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<ArchiveSyncResult>(SYNC_RESULT_EVENT, {
          detail: { slug, archived, persisted: 'client' },
        })
      );
    }
    return 'client';
  }
}

/**
 * Przełącza status archiwizacji artykułu (Archive / Unarchive)
 * Zwraca nowy stan { archived, manualOverride }
 */
export interface ToggleArchiveOptions {
  slug: string;
  defaultArchived?: boolean;
  defaultManualOverride?: boolean;
  /** Data publikacji artykułu (ISO date string) */
  publishedDate?: string;
  /** Opcjonalna data wydarzenia (ISO date string lub null) */
  eventDate?: string | null;
  /** Jednostronny fallback przy odczycie starszego stanu (publishedDate ?? pubDate) */
  pubDate?: string;
}

/**
 * Przełącza status archiwizacji artykułu (Archive / Unarchive)
 * Zwraca nowy stan { archived, manualOverride }
 */
export function toggleItemArchive(options: ToggleArchiveOptions): ArchiveState {
  const {
    slug,
    defaultArchived = false,
    defaultManualOverride = false,
    publishedDate,
    pubDate,
  } = options;
  const currentOverrides = getStoredArchiveOverrides();
  const storedEntry = currentOverrides[slug];

  const isCurrentlyArchived =
    slug in currentOverrides
      ? currentOverrides[slug].archived
      : slug in serverStatesCache
      ? serverStatesCache[slug].archived
      : Boolean(defaultArchived);

  const nextArchived = !isCurrentlyArchived;
  let nextManualOverride = defaultManualOverride;

  // AC 4: Jeśli użytkownik ręcznie przywraca z archiwum artykuł starszy niż AUTO_ARCHIVE_DAYS,
  // otrzymuje on flagę manualOverride = true, aby nocny worker go nie zarchiwizował ponownie.
  // Zachowujemy jednostronny fallback (publishedDate ?? pubDate) dla zapisanych wcześniej stanów w localStorage.
  const resolvedPublishedDate = publishedDate ?? pubDate ?? storedEntry?.publishedDate;
  if (!nextArchived) {
    if (resolvedPublishedDate) {
      const articleTime = new Date(resolvedPublishedDate).getTime();
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
    ...(resolvedPublishedDate ? { publishedDate: resolvedPublishedDate } : {}),
    updatedAt: Date.now(),
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
    [slug]: {
      ...state,
      updatedAt: Date.now(),
    },
  };
  saveArchiveOverrides(nextOverrides);
  syncToBackend(slug, state.archived, state.manualOverride).catch(() => {});
}

/**
 * Hook React do obserwacji stanu archiwizacji
 */
export function useArchive() {
  const [overrides, setOverrides] = useState<Record<string, ArchiveState>>({});
  const [serverStates, setServerStates] = useState<Record<string, ArchiveState>>(serverStatesCache);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setOverrides(getStoredArchiveOverrides());
    setIsLoaded(true);

    // Pobierz świeży stan z serwera (/api/archive GET), aby zsynchronizować zmiany między urządzeniami
    fetchServerArchiveStates().then((remote) => {
      setServerStates({ ...remote });
      setOverrides(getStoredArchiveOverrides());
    });

    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, ArchiveState>>;
      setServerStates({ ...serverStatesCache });
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

    const handleFocus = () => {
      fetchServerArchiveStates().then((remote) => {
        setServerStates({ ...remote });
        setOverrides(getStoredArchiveOverrides());
      });
    };

    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const getStatus = useCallback(
    (slug: string, defaultArchived = false) => {
      if (slug in overrides) {
        return overrides[slug].archived;
      }
      if (slug in serverStates) {
        return serverStates[slug].archived;
      }
      return Boolean(defaultArchived);
    },
    [overrides, serverStates]
  );

  return {
    overrides,
    getStatus,
    toggleArchive: toggleItemArchive,
    setArchiveState: setItemArchiveState,
    isLoaded,
  };
}
