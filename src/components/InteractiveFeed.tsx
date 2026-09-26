import React, { useState, useMemo } from 'react';
import { Search, MapPin, Calendar, ExternalLink, Bot, ShieldAlert, Sparkles, Filter, X, Smile } from 'lucide-react';
import { CITIES, CATEGORIES } from '../lib/constants';
import { CityBadge } from './CityBadge';
import { CategoryBadge } from './CategoryBadge';

export interface FeedItem {
  id: string;
  slug: string;
  title: string;
  pubDate: string; // ISO date string
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
}

interface InteractiveFeedProps {
  initialItems: FeedItem[];
  defaultCategory?: string;
  defaultOnlyKids?: boolean;
}

export const InteractiveFeed: React.FC<InteractiveFeedProps> = ({
  initialItems,
  defaultCategory = 'all',
  defaultOnlyKids = false,
}) => {
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const [onlyKids, setOnlyKids] = useState<boolean>(defaultOnlyKids);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDrafts, setShowDrafts] = useState<boolean>(false);

  // Liczba wydarzeń dla dzieci
  const kidsCount = useMemo(() => {
    return initialItems.filter(
      (item) => (item.status === 'published' || showDrafts) && (item.category === 'dla-dzieci' || item.isForKids)
    ).length;
  }, [initialItems, showDrafts]);

  // Zliczanie wpisów per miasto
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    initialItems.forEach((item) => {
      if (item.status === 'published' || showDrafts) {
        if (!onlyKids || item.category === 'dla-dzieci' || item.isForKids) {
          counts.all = (counts.all || 0) + 1;
          counts[item.city] = (counts[item.city] || 0) + 1;
        }
      }
    });
    return counts;
  }, [initialItems, showDrafts, onlyKids]);

  // Liczba szkiców oczekujących na zatwierdzenie
  const draftCount = useMemo(() => {
    return initialItems.filter((i) => i.status === 'draft').length;
  }, [initialItems]);

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
    });
  }, [initialItems, selectedCity, selectedCategory, searchQuery, showDrafts, onlyKids]);

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

  const hasActiveFilters = selectedCity !== 'all' || selectedCategory !== 'all' || searchQuery !== '' || onlyKids;

  const clearFilters = () => {
    setSelectedCity('all');
    setSelectedCategory('all');
    setOnlyKids(false);
    setSearchQuery('');
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
              href="/keystatic"
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
        <span>
          Znaleziono <strong className="text-zinc-100">{filteredItems.length}</strong>{' '}
          {filteredItems.length === 1 ? 'wiadomość' : 'wiadomości'}
          {onlyKids && ' (👶 Wyłącznie dla dzieci 4-10 lat)'}
          {selectedCity !== 'all' && ` dla miasta: ${CITIES[selectedCity]?.name}`}
          {showDrafts && ' (Tryb szkiców)'}
        </span>
        <span className="text-xs text-zinc-500 hidden sm:inline">
          Aktualizowane codziennie o 6:00
        </span>
      </div>

      {/* Brak wyników */}
      {filteredItems.length === 0 && (
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
        {filteredItems.map((item) => (
          <article
            key={item.id}
            className={`group bg-zinc-900/80 hover:bg-zinc-900 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 ${
              item.isAlert
                ? 'border-rose-500/40 hover:border-rose-500/70 bg-gradient-to-b from-rose-950/20 to-zinc-900/80'
                : item.category === 'dla-dzieci' || item.isForKids
                ? 'border-emerald-500/40 hover:border-emerald-500/70 bg-gradient-to-b from-emerald-950/15 to-zinc-900/80'
                : 'border-zinc-800/90 hover:border-zinc-700'
            }`}
          >
            <div>
              {/* Odznaki: Miasto + Kategoria + Wiek dziecka jeśli określony */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                <div className="flex items-center gap-1.5">
                  <CityBadge city={item.city} size="sm" />
                  <CategoryBadge category={item.category} />
                </div>
                {(item.ageRange || item.isForKids) && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <Smile className="w-3 h-3" />
                    {item.ageRange || 'Dzieci 4-10 lat'}
                  </span>
                )}
              </div>

              {/* Tytuł */}
              <h2 className="text-lg font-bold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-2 mb-2 leading-snug">
                <a href={`/wpis/${item.slug}`} className="hover:underline">
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
                    <span>{formatDate(item.pubDate)}</span>
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
                href={`/wpis/${item.slug}`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800/70 hover:bg-amber-400 text-zinc-300 hover:text-zinc-950 transition-all group-hover:bg-zinc-800"
              >
                Czytaj szczegóły
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
