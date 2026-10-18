import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  MapPin,
  Calendar,
  ExternalLink,
  Bot,
  ShieldAlert,
  Sparkles,
  Filter,
  X,
  Smile,
  ArrowDownWideNarrow,
  Heart,
  Archive,
} from 'lucide-react';
import { CITIES, CATEGORIES } from '../lib/constants';
import { CityBadge } from './CityBadge';
import { CategoryBadge } from './CategoryBadge';
import { useFavorites } from '../lib/favorites';
import { ArchiveButton, ArchiveAIcon } from './ArchiveButton';
import { useArchive, SYNC_RESULT_EVENT, type ArchiveState, type ArchiveSyncResult } from '../lib/archive';

export interface FeedItem {
  id: string;
  slug: string;
  title: string;
  pubDate: string; // ISO date string
  sourceDate?: string; // ISO date string from the original publisher
  city: string;
  category: string;
  status: 'published' | 'draft';
  summary: string;
  location?: string;
  isAlert: boolean;
  isForKids?: boolean;
  ageRange?: string;
  sourceUrl?: string;
  aiGenerated: boolean;
  archived?: boolean;
  manualOverride?: boolean;
}

interface InteractiveFeedProps {
  initialItems: FeedItem[];
  defaultCategory?: string;
  defaultOnlyKids?: boolean;
  defaultOnlyFavorites?: boolean;
  isArchiveView?: boolean;
}

const PAGE_SIZE = 12;

export const InteractiveFeed: React.FC<InteractiveFeedProps> = ({
  initialItems,
  defaultCategory = 'all',
  defaultOnlyKids = false,
  defaultOnlyFavorites = false,
  isArchiveView = false,
}) => {
  const rawBase = import.meta.env.BASE_URL || '/';
  const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  const { favorites, isFavorite, toggleFavorite, favoritesCount, isLoaded } = useFavorites();
  const { getStatus, setArchiveState, isLoaded: isArchiveLoaded } = useArchive();

  const [toast, setToast] = useState<{
    message: string;
    slug: string;
    previousState: ArchiveState;
    newState: ArchiveState;
    title: string;
    persisted?: 'fs' | 'github' | 'client';
  } | null>(null);

  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const [onlyKids, setOnlyKids] = useState<boolean>(defaultOnlyKids);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(defaultOnlyFavorites);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDrafts, setShowDrafts] = useState<boolean>(false);
  const [datePreset, setDatePreset] = useState<'all' | '7' | '30' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-zamykanie powiadomienia Toast po 5 sekundach (AC 5)
  useEffect(() => {
    if (!toast) return;
    const duration = toast.persisted === 'client' ? 8000 : 5000;
    const timer = setTimeout(() => {
      setToast(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast]);

  // Nasłuchiwanie na wynik synchronizacji z backendem (/api/archive)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSyncResult = (e: Event) => {
      const custom = e as CustomEvent<ArchiveSyncResult>;
      if (!custom.detail) return;
      setToast((prev) => {
        if (!prev || prev.slug !== custom.detail.slug) return prev;
        return { ...prev, persisted: custom.detail.persisted };
      });
    };
    window.addEventListener(SYNC_RESULT_EVENT, handleSyncResult);
    return () => window.removeEventListener(SYNC_RESULT_EVENT, handleSyncResult);
  }, []);

  const handleArchiveToggle = (item: FeedItem, newState: ArchiveState, oldState: ArchiveState) => {
    const actionText = newState.archived ? 'Przeniesiono do archiwum' : 'Przywrócono z archiwum';
    setToast({
      message: `${actionText}: „${item.title.length > 35 ? item.title.slice(0, 35) + '…' : item.title}”`,
      slug: item.slug,
      previousState: oldState,
      newState,
      title: item.title,
    });
  };

  const handleUndoToast = () => {
    if (!toast) return;
    setArchiveState(toast.slug, toast.previousState);
    setToast(null);
  };

  // Sprawdź parametr URL ?widok=ulubione po zamontowaniu na kliencie
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('widok') === 'ulubione' || params.get('ulubione') === 'true') {
      setShowOnlyFavorites(true);
    }
  }, []);

  // Synchronizacja parametru w pasku adresu przy przełączaniu
  const handleToggleFavorites = () => {
    setShowOnlyFavorites((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (next) {
          url.searchParams.set('widok', 'ulubione');
        } else {
          url.searchParams.delete('widok');
          url.searchParams.delete('ulubione');
        }
        window.history.replaceState({}, '', url.toString());
      }
      return next;
    });
  };

  const getItemDate = (item: FeedItem) => (item.sourceDate || item.pubDate).slice(0, 10);
  const setPreset = (preset: 'all' | '7' | '30' | 'custom') => {
    setDatePreset(preset);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'custom') return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (Number(preset) - 1));
    const toInputDate = (date: Date) => {
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
    };
    setDateFrom(toInputDate(start));
    setDateTo(toInputDate(end));
  };

  // Liczba wydarzeń dla dzieci
  const kidsCount = useMemo(() => {
    return initialItems.filter((item) => {
      const itemIsArchived = getStatus(item.slug, Boolean(item.archived));
      if (isArchiveView && !itemIsArchived) return false;
      if (!isArchiveView && !showOnlyFavorites && itemIsArchived) return false;
      return (item.status === 'published' || showDrafts) && (item.category === 'dla-dzieci' || item.isForKids);
    }).length;
  }, [initialItems, showDrafts, isArchiveView, showOnlyFavorites, getStatus]);

  // Zliczanie wpisów per miasto z uwzględnieniem trybu ulubionych / archiwum / dziecięcego
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    initialItems.forEach((item) => {
      if (item.status === 'published' || showDrafts) {
        const itemIsArchived = getStatus(item.slug, Boolean(item.archived));
        if (isArchiveView && !itemIsArchived) return;
        if (!isArchiveView && !showOnlyFavorites && itemIsArchived) return;

        if (onlyKids && item.category !== 'dla-dzieci' && !item.isForKids) return;
        if (showOnlyFavorites && !favorites.includes(item.slug)) return;

        counts.all = (counts.all || 0) + 1;
        counts[item.city] = (counts[item.city] || 0) + 1;
      }
    });
    return counts;
  }, [initialItems, showDrafts, onlyKids, showOnlyFavorites, favorites, isArchiveView, getStatus]);

  // Liczba szkiców oczekujących na zatwierdzenie
  const draftCount = useMemo(() => {
    return initialItems.filter((i) => i.status === 'draft').length;
  }, [initialItems]);

  // Całkowita liczba zarchiwizowanych wpisów
  const archivedTotalCount = useMemo(() => {
    return initialItems.filter((item) => {
      if (!showDrafts && item.status === 'draft') return false;
      return getStatus(item.slug, Boolean(item.archived));
    }).length;
  }, [initialItems, showDrafts, getStatus]);

  // Filtrowanie wpisów
  const filteredItems = useMemo(() => {
    return initialItems.filter((item) => {
      // Filtr statusu (domyślnie tylko opublikowane)
      if (!showDrafts && item.status === 'draft') {
        return false;
      }
      if (showDrafts && item.status !== 'draft') {
        return false;
      }

      // Filtr sekcji Archiwum vs Widok główny/kategorie (AC 2, AC 3, AC 4)
      const itemIsArchived = getStatus(item.slug, Boolean(item.archived));
      if (isArchiveView) {
        if (!itemIsArchived) return false;
      } else if (!showOnlyFavorites) {
        if (itemIsArchived) return false;
      }

      // Filtr sekcji ulubionych
      if (showOnlyFavorites && !favorites.includes(item.slug)) {
        return false;
      }

      // Filtr sekcji dziecięcej
      if (onlyKids && item.category !== 'dla-dzieci' && !item.isForKids) {
        return false;
      }

      // Filtr miasta
      if (selectedCity !== 'all' && item.city !== selectedCity) {
        return false;
      }

      // Filtr kategorii
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Filtr daty
      const itemDate = getItemDate(item);
      if (dateFrom && itemDate < dateFrom) return false;
      if (dateTo && itemDate > dateTo) return false;

      // Filtr wyszukiwarki
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesSummary = item.summary.toLowerCase().includes(query);
        const matchesLocation = item.location?.toLowerCase().includes(query);
        const matchesCityName = CITIES[item.city]?.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSummary && !matchesLocation && !matchesCityName) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const difference = getItemDate(b).localeCompare(getItemDate(a));
      return sortOrder === 'newest' ? difference : -difference;
    });
  }, [initialItems, selectedCity, selectedCategory, searchQuery, showDrafts, onlyKids, showOnlyFavorites, favorites, dateFrom, dateTo, sortOrder, isArchiveView, getStatus]);

  // Reset widocznych elementów przy zmianie filtrów lub sortowania
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    selectedCity,
    selectedCategory,
    searchQuery,
    showDrafts,
    onlyKids,
    showOnlyFavorites,
    dateFrom,
    dateTo,
    sortOrder,
  ]);

  // Wpisy do wyświetlenia (paginacja / dynamiczne doładowywanie)
  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  // Obsługa automatycznego doładowywania kolejnych wpisów przy scrollu (infinite scroll)
  useEffect(() => {
    if (visibleCount >= filteredItems.length) return;
    const target = sentinelRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredItems.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, filteredItems.length]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredItems.length));
  };

  const handleLoadAll = () => {
    setVisibleCount(filteredItems.length);
  };

  // Formatowanie daty po polsku
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const hasActiveFilters =
    selectedCity !== 'all' ||
    selectedCategory !== 'all' ||
    searchQuery !== '' ||
    onlyKids ||
    showOnlyFavorites ||
    dateFrom !== '' ||
    dateTo !== '';

  const clearFilters = () => {
    setSelectedCity('all');
    setSelectedCategory('all');
    setOnlyKids(false);
    setShowOnlyFavorites(false);
    setSearchQuery('');
    setPreset('all');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('widok');
      url.searchParams.delete('ulubione');
      window.history.replaceState({}, '', url.toString());
    }
  };

  return (
    <div className="space-y-8">
      {/* Baner moderacji jeśli są szkice do zatwierdzenia */}
      {draftCount > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <p className="font-semibold text-zinc-100 text-sm">
                Kolejka moderacji: {draftCount} {draftCount === 1 ? 'wpis oczekuje' : 'wpisy oczekują'} na weryfikację
              </p>
              <p className="text-xs text-amber-300/80">
                Możesz przejrzeć i zatwierdzić szkice w panelu administracyjnym.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDrafts(!showDrafts)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                showDrafts
                  ? 'bg-amber-500 text-zinc-950 border-amber-400'
                  : 'bg-zinc-900 text-amber-300 border-amber-500/40 hover:bg-zinc-800'
              }`}
            >
              {showDrafts ? 'Wróć do opublikowanych' : 'Podgląd szkiców'}
            </button>
            <a
              href={`${baseUrl}keystatic`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition-colors inline-flex items-center gap-1"
            >
              Otwórz panel Keystatic <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Panel filtrów i wyszukiwarki */}
      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-5 md:p-6 shadow-xl backdrop-blur-sm space-y-6">
        {/* Wyszukiwarka tekstowa na żywo i Szybki Przełącznik Dziecięcy */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj wydarzenia, teatrzyku, warsztatów, koncertu, klocków..."
              className="w-full bg-zinc-950/80 border border-zinc-800 focus:border-amber-400 rounded-xl pl-12 pr-10 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                aria-label="Wyczyść szukanie"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Duży wyróżniony przycisk strefy dziecięcej */}
          <button
            onClick={() => setOnlyKids(!onlyKids)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all border sm:flex-shrink-0 ${
              onlyKids
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-950/80 hover:bg-emerald-950/30 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/60'
            }`}
          >
            <Smile className="w-4 h-4" />
            <span>Strefa Dzieciaka (4-10 lat)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${onlyKids ? 'bg-zinc-950 text-emerald-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {kidsCount}
            </span>
          </button>
        </div>

        {/* Sekcja filtrów dat oraz wejście do ulubionych po lewej stronie */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Data publikacji źródła
              </span>
              <p className="text-xs text-zinc-500 mt-1">Starsze wpisy bez daty źródłowej używają daty dodania do portalu.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Dedykowany przycisk wejścia do podsekcji ulubionych po lewej stronie filtrów dat */}
              <button
                type="button"
                onClick={handleToggleFavorites}
                aria-pressed={showOnlyFavorites}
                title={showOnlyFavorites ? 'Pokaż wszystkie artykuły' : 'Pokaż tylko artykuły z ulubionych'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5 shadow-sm ${
                  showOnlyFavorites
                    ? 'bg-rose-500 text-white border-rose-400 shadow-rose-500/20 ring-1 ring-rose-400/50'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-rose-400/60 hover:text-rose-300 hover:bg-zinc-800'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 transition-transform ${
                    showOnlyFavorites ? 'fill-current text-white scale-110' : 'text-rose-400'
                  }`}
                />
                <span>Ulubione</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    showOnlyFavorites
                      ? 'bg-rose-700 text-white'
                      : favoritesCount > 0
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {isLoaded ? favoritesCount : 0}
                </span>
              </button>

              <span className="w-px h-5 bg-zinc-800 mx-1 hidden sm:inline-block" aria-hidden="true" />

              {/* Filtry z datami */}
              {([
                ['all', 'Dowolna data'],
                ['7', 'Ostatnie 7 dni'],
                ['30', 'Ostatnie 30 dni'],
                ['custom', 'Wybierz zakres'],
              ] as const).map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() => setPreset(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    datePreset === preset
                      ? 'bg-amber-400 text-zinc-950 border-amber-400'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {datePreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <label className="text-xs text-zinc-400 space-y-1.5">
                <span>Od</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="block w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                />
              </label>
              <label className="text-xs text-zinc-400 space-y-1.5">
                <span>Do</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="block w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 focus:outline-none"
                />
              </label>
            </div>
          )}
        </div>

        {/* Pigułki miast */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" /> Miasto lub obszar:
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
              >
                Resetuj filtry
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCity('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selectedCity === 'all'
                  ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-md shadow-amber-400/10'
                  : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60'
              }`}
            >
              Wszystkie ({cityCounts.all || 0})
            </button>
            {Object.entries(CITIES).map(([cityKey, cityData]) => {
              const count = cityCounts[cityKey] || 0;
              const isSelected = selectedCity === cityKey;
              return (
                <button
                  key={cityKey}
                  onClick={() => setSelectedCity(cityKey)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold shadow-md shadow-amber-400/10'
                      : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/60'
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: isSelected ? '#18181b' : cityData.color }}
                  ></span>
                  {cityData.name}
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-zinc-900/30 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kategorie (Chips) */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-2.5">
            <Filter className="w-3.5 h-3.5 text-amber-400" /> Kategoria:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                selectedCategory === 'all'
                  ? 'bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              Wszystkie kategorie
            </button>
            {Object.entries(CATEGORIES).map(([catKey, catData]) => {
              const isSelected = selectedCategory === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                    isSelected
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {catData.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nagłówek wyników i status */}
      <div className="flex items-center justify-between text-sm text-zinc-400 px-1">
        <span className="flex items-center flex-wrap gap-1.5">
          <span>
            Znaleziono <strong className="text-zinc-100">{filteredItems.length}</strong>{' '}
            {isArchiveView
              ? filteredItems.length === 1
                ? 'zarchiwizowany artykuł'
                : 'zarchiwizowanych artykułów'
              : filteredItems.length === 1
              ? 'wiadomość'
              : 'wiadomości'}
          </span>
          {isArchiveView && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Archive className="w-3 h-3 text-amber-400" />
              Sekcja Archiwum
            </span>
          )}
          {showOnlyFavorites && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <Heart className="w-3 h-3 fill-current text-rose-400" />
              Tylko Ulubione
            </span>
          )}
          {onlyKids && <span className="text-zinc-400">(👶 Dzieci 4-10 lat)</span>}
          {selectedCity !== 'all' && <span>dla: <span className="text-zinc-200 font-medium">{CITIES[selectedCity]?.name}</span></span>}
          {showDrafts && <span className="text-amber-300 font-medium">(Tryb szkiców)</span>}
        </span>
        <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
          <ArrowDownWideNarrow className="w-3.5 h-3.5 text-amber-400" />
          <span>Sortuj</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-amber-400 focus:outline-none"
          >
            <option value="newest">Najnowsze najpierw</option>
            <option value="oldest">Najstarsze najpierw</option>
          </select>
        </label>
      </div>

      {/* Dedykowany pusty stan dla braku ulubionych */}
      {showOnlyFavorites && favoritesCount === 0 && (
        <div className="text-center py-16 px-4 bg-zinc-900/40 border border-dashed border-rose-500/30 rounded-3xl">
          <div className="inline-flex p-4 rounded-full bg-rose-500/10 text-rose-400 mb-4 border border-rose-500/20">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">
            Nie masz jeszcze ulubionych artykułów
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
            Kliknij ikonę serduszka (❤️) na dowolnym kafelku lub wewnątrz wybranego artykułu, aby zapisać go w tej sekcji.
          </p>
          <button
            onClick={() => setShowOnlyFavorites(false)}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm transition-colors"
          >
            Przeglądaj wszystkie wiadomości
          </button>
        </div>
      )}

      {/* Brak wyników przy aktywnych filtrach w trybie ulubionych */}
      {showOnlyFavorites && favoritesCount > 0 && filteredItems.length === 0 && (
        <div className="text-center py-16 px-4 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-3xl">
          <div className="inline-flex p-4 rounded-full bg-zinc-800/80 text-rose-400 mb-4">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-1">
            Brak ulubionych wpisów dla wybranych filtrów
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
            Masz zapisane {favoritesCount} {favoritesCount === 1 ? 'artykuł' : 'artykuły'} w ulubionych, ale żaden nie pasuje do aktualnych filtrów miasta, kategorii lub daty.
          </p>
          <button
            onClick={() => {
              setSelectedCity('all');
              setSelectedCategory('all');
              setSearchQuery('');
              setPreset('all');
            }}
            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-rose-500/20"
          >
            Pokaż wszystkie zapisane ulubione
          </button>
        </div>
      )}

      {/* Dedykowany pusty stan dla całkowitego braku artykułów w archiwum (AC 6) */}
      {(isArchiveView && initialItems.length === 0 || (isArchiveView && archivedTotalCount === 0)) && (
        <div className="text-center py-16 px-4 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-3xl">
          <div className="inline-flex p-4 rounded-full bg-amber-500/10 text-amber-400 mb-4 border border-amber-500/20">
            <Archive className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-1">
            Brak zarchiwizowanych artykułów
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
            Aktualnie żadne artykuły nie zostały jeszcze przeniesione do archiwum.
          </p>
          <a
            href={baseUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm transition-colors"
          >
            Przejdź do aktualności
          </a>
        </div>
      )}

      {/* Pusty stan dla archiwum gdy wpisy są w archiwum, ale żaden nie pasuje do wybranych filtrów */}
      {isArchiveView && initialItems.length > 0 && archivedTotalCount > 0 && filteredItems.length === 0 && (
        <div className="text-center py-16 px-4 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-3xl">
          <div className="inline-flex p-4 rounded-full bg-zinc-800/80 text-amber-400 mb-4">
            <Archive className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-1">
            Brak zarchiwizowanych artykułów dla wybranych filtrów
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
            W archiwum znajduje się {archivedTotalCount}{' '}
            {archivedTotalCount === 1 ? 'wpis' : (archivedTotalCount % 10 >= 2 && archivedTotalCount % 10 <= 4 && (archivedTotalCount % 100 < 10 || archivedTotalCount % 100 >= 20)) ? 'wpisy' : 'wpisów'}, ale żaden nie pasuje do aktualnych filtrów miasta, kategorii lub daty.
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm transition-colors"
          >
            Resetuj filtry
          </button>
        </div>
      )}

      {/* Brak wyników w trybie standardowym */}
      {!isArchiveView && !showOnlyFavorites && filteredItems.length === 0 && (
        <div className="text-center py-16 px-4 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-3xl">
          <div className="inline-flex p-4 rounded-full bg-zinc-800/80 text-amber-400 mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-1">
            Brak wydarzeń spełniających kryteria
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
            Nie znaleźliśmy żadnych wpisów dla wybranego miasta lub filtru. Spróbuj wyczyścić filtry.
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-sm transition-colors"
          >
            Pokaż wszystkie wiadomości
          </button>
        </div>
      )}

      {/* Siatka kart wpisów */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedItems.map((item) => {
          const itemIsFav = isLoaded && isFavorite(item.slug);
          const itemIsArchived = isArchiveLoaded ? getStatus(item.slug, Boolean(item.archived)) : Boolean(item.archived);

          return (
            <article
              key={item.id}
              className={`group bg-zinc-900/80 hover:bg-zinc-900 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 ${
                item.isAlert
                  ? 'border-rose-500/40 hover:border-rose-500/70 bg-gradient-to-b from-rose-950/20 to-zinc-900/80'
                  : item.category === 'dla-dzieci' || item.isForKids
                  ? 'border-emerald-500/40 hover:border-emerald-500/70 bg-gradient-to-b from-emerald-950/15 to-zinc-900/80'
                  : itemIsFav
                  ? 'border-rose-500/30 hover:border-rose-500/50 bg-gradient-to-b from-rose-950/10 to-zinc-900/80'
                  : 'border-zinc-800/90 hover:border-zinc-700'
              }`}
            >
              <div>
                {/* Odznaki: Miasto + Kategoria + Wiek dziecka jeśli określony + Przyciski Archiwum & Serduszko */}
                <div className="flex items-center justify-between gap-2 mb-3.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CityBadge city={item.city} size="sm" />
                    <CategoryBadge category={item.category} />
                    {itemIsArchived && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Archive className="w-3 h-3 text-amber-400" />
                        Archiwum
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(item.ageRange || item.isForKids) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <Smile className="w-3 h-3" />
                        {item.ageRange || 'Dzieci 4-10 lat'}
                      </span>
                    )}

                    {/* Dedykowany przycisk archiwizacji z literą „A” (AC 1, AC 3, AC 5) */}
                    <ArchiveButton
                      slug={item.slug}
                      title={item.title}
                      pubDate={item.pubDate}
                      sourceDate={item.sourceDate}
                      defaultArchived={Boolean(item.archived)}
                      defaultManualOverride={Boolean(item.manualOverride)}
                      size="sm"
                      onToggle={(newState, oldState) => handleArchiveToggle(item, newState, oldState)}
                    />

                    {/* Ergonomiczna ikona serduszka na kafelku */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(item.slug);
                      }}
                      aria-label={itemIsFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                      title={itemIsFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                      className={`p-1.5 rounded-full border transition-all duration-200 active:scale-90 focus:outline-none focus:ring-2 focus:ring-rose-400/50 cursor-pointer ${
                        itemIsFav
                          ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 hover:bg-rose-500/30 shadow-sm shadow-rose-500/10 scale-105'
                          : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-rose-400 hover:border-rose-400/50 hover:bg-zinc-800'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 transition-transform duration-200 ${
                          itemIsFav ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Tytuł */}
                <h2 className="text-lg font-bold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-2 mb-2 leading-snug">
                  <a href={`${baseUrl}wpis/${item.slug}`} className="hover:underline">
                    {item.title}
                  </a>
                </h2>

                {/* Zajawka */}
                <p className="text-sm text-zinc-400 line-clamp-3 mb-4 leading-relaxed">
                  {item.summary}
                </p>
              </div>

              <div>
                {/* Metadane: Lokalizacja i Data */}
                <div className="space-y-1.5 text-xs text-zinc-500 border-t border-zinc-800/80 pt-3.5 mb-4">
                  {item.location && (
                    <div className="flex items-center gap-1.5 text-zinc-400 truncate">
                      <MapPin className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{formatDate(item.sourceDate || item.pubDate)}</span>
                    </div>
                    {item.aiGenerated && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full"
                        title="Przygotowane we współpracy z Agentem AI"
                      >
                        <Bot className="w-3 h-3 text-amber-400" />
                        Agent AI
                      </span>
                    )}
                  </div>
                </div>

                {/* Przycisk Przejdź do wpisu */}
                <a
                  href={`${baseUrl}wpis/${item.slug}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800/70 hover:bg-amber-400 text-zinc-300 hover:text-zinc-950 transition-all group-hover:bg-zinc-800"
                >
                  Czytaj szczegóły
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {/* Element sentinel do infinite scroll */}
      {visibleCount < filteredItems.length && (
        <div ref={sentinelRef} className="h-6 w-full" aria-hidden="true" />
      )}

      {/* Paginacja / Załaduj więcej */}
      {filteredItems.length > PAGE_SIZE && (
        <div className="flex flex-col items-center justify-center gap-3 pt-6 pb-2 border-t border-zinc-800/60">
          <div className="text-xs text-zinc-400">
            Wyświetlono <strong className="text-zinc-100">{displayedItems.length}</strong> z{' '}
            <strong className="text-zinc-100">{filteredItems.length}</strong> artykułów
          </div>
          <div className="w-full max-w-xs bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (displayedItems.length / filteredItems.length) * 100)}%` }}
            />
          </div>
          {visibleCount < filteredItems.length && (
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs transition-colors shadow-md shadow-amber-400/10 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Załaduj więcej wpisów (+{Math.min(PAGE_SIZE, filteredItems.length - visibleCount)})</span>
              </button>
              <button
                type="button"
                onClick={handleLoadAll}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold text-xs border border-zinc-700 transition-colors cursor-pointer"
              >
                Pokaż wszystkie ({filteredItems.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast Feedback z przyciskiem Cofnij (AC 5) */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-md bg-zinc-900 border border-zinc-700/80 text-zinc-100 px-4 py-3 rounded-2xl shadow-2xl shadow-black/80 flex items-center gap-3 backdrop-blur-md"
        >
          <span className="p-2 bg-amber-500/20 text-amber-400 rounded-xl flex-shrink-0">
            <ArchiveAIcon className="w-4 h-4" />
          </span>
          <div className="flex-grow min-w-0 space-y-0.5">
            <p className="text-xs font-medium text-zinc-200 truncate">
              {toast.message}
            </p>
            {toast.persisted === 'client' && (
              <p className="text-[11px] text-amber-300/90 leading-snug">
                Zapisano tylko lokalnie na tym urządzeniu.{' '}
                <a
                  href={`${baseUrl}keystatic`}
                  className="underline font-semibold hover:text-amber-200"
                >
                  Zaloguj się w Panelu Admina
                </a>
                , aby zsynchronizować w chmurze.
              </p>
            )}
            {(toast.persisted === 'github' || toast.persisted === 'fs') && (
              <p className="text-[11px] text-emerald-400/90 leading-snug">
                Zapisano na serwerze (zsynchronizowano między urządzeniami)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleUndoToast}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-500/10 transition-colors flex-shrink-0 underline underline-offset-2 cursor-pointer"
          >
            Cofnij
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1 flex-shrink-0 cursor-pointer"
            aria-label="Zamknij powiadomienie"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}
    </div>
  );
};
