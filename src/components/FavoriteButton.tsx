import React from 'react';
import { Heart } from 'lucide-react';
import { useFavorites } from '../lib/favorites';

interface FavoriteButtonProps {
  slug: string;
  title?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  slug,
  title,
  showLabel = false,
  size = 'md',
  className = '',
}) => {
  const { isFavorite, toggleFavorite, isLoaded } = useFavorites();
  const favorited = isLoaded ? isFavorite(slug) : false;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(slug);
  };

  const label = favorited ? 'W ulubionych' : 'Dodaj do ulubionych';
  const ariaLabel = favorited
    ? `Usuń ${title ? `„${title}” ` : ''}z ulubionych`
    : `Dodaj ${title ? `„${title}” ` : ''}do ulubionych`;

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        aria-pressed={favorited}
        title={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-400/50 ${
          size === 'sm' ? 'px-3 py-1.5' : 'px-3.5 py-2'
        } ${
          favorited
            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25 shadow-sm shadow-rose-500/10'
            : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 hover:border-rose-500/50 hover:text-rose-400 hover:bg-zinc-800'
        } ${className}`}
      >
        <Heart
          className={`transition-all duration-200 ${
            size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
          } ${
            favorited
              ? 'fill-rose-500 text-rose-500 scale-110 drop-shadow'
              : 'text-zinc-400 group-hover:text-rose-400'
          }`}
        />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-pressed={favorited}
      title={ariaLabel}
      className={`rounded-full border transition-all duration-200 active:scale-90 focus:outline-none focus:ring-2 focus:ring-rose-400/50 ${
        size === 'sm' ? 'p-1.5' : 'p-2'
      } ${
        favorited
          ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 hover:bg-rose-500/30 shadow-sm shadow-rose-500/10 scale-105'
          : 'bg-zinc-800/70 text-zinc-400 border-zinc-700/70 hover:text-rose-400 hover:border-rose-400/50 hover:bg-zinc-800'
      } ${className}`}
    >
      <Heart
        className={`transition-all duration-200 ${
          size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
        } ${
          favorited ? 'fill-rose-500 text-rose-500 scale-110' : ''
        }`}
      />
    </button>
  );
};
