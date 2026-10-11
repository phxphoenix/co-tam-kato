import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kato_favorite_articles_v1';
const UPDATE_EVENT = 'kato_favorites_changed';

/**
 * Safely retrieves favorites list from localStorage
 */
export function getStoredFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse favorites from localStorage:', error);
    return [];
  }
}

/**
 * Persists favorites list and notifies all subscribers across tabs and components
 */
export function saveFavorites(favorites: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(favorites));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: unique }));
  } catch (error) {
    console.warn('Failed to save favorites to localStorage:', error);
  }
}

/**
 * Checks if a specific article slug is in favorites
 */
export function isArticleFavorite(slug: string): boolean {
  const favs = getStoredFavorites();
  return favs.includes(slug);
}

/**
 * Toggles favorite status for a given slug.
 * Returns true if added, false if removed.
 */
export function toggleArticleFavorite(slug: string): boolean {
  const favs = getStoredFavorites();
  const exists = favs.includes(slug);
  const next = exists ? favs.filter((item) => item !== slug) : [...favs, slug];
  saveFavorites(next);
  return !exists;
}

/**
 * React hook to observe and update favorites in any component
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Initial load on client
    setFavorites(getStoredFavorites());
    setIsLoaded(true);

    // Listen for custom event within same window
    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<string[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setFavorites(customEvent.detail);
      } else {
        setFavorites(getStoredFavorites());
      }
    };

    // Listen for native storage event for cross-tab sync
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setFavorites(getStoredFavorites());
      }
    };

    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const isFavorite = useCallback(
    (slug: string) => {
      return favorites.includes(slug);
    },
    [favorites]
  );

  const toggleFavorite = useCallback((slug: string) => {
    return toggleArticleFavorite(slug);
  }, []);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    favoritesCount: favorites.length,
    isLoaded,
  };
}
