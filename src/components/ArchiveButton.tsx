import React from 'react';
import { useArchive, type ArchiveState } from '../lib/archive';

export const ArchiveAIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Górna pokrywa pudełka */}
    <rect x="3" y="3" width="18" height="4" rx="1" />
    {/* Korpus pudełka archiwizacyjnego */}
    <path d="M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7" />
    {/* Wyraźna, nowoczesna litera A pośrodku pudełka */}
    <path d="M9.2 16.5l2.8 -6.5l2.8 6.5" strokeWidth="2.2" />
    <path d="M10 14.2h4" strokeWidth="2.2" />
  </svg>
);

interface ArchiveButtonProps {
  slug: string;
  title?: string;
  pubDate?: string;
  sourceDate?: string;
  defaultArchived?: boolean;
  defaultManualOverride?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  onToggle?: (newState: ArchiveState, oldState: ArchiveState) => void;
}

export const ArchiveButton: React.FC<ArchiveButtonProps> = ({
  slug,
  title,
  pubDate,
  sourceDate,
  defaultArchived = false,
  defaultManualOverride = false,
  showLabel = false,
  size = 'md',
  className = '',
  onToggle,
}) => {
  const { getStatus, toggleArchive, isLoaded } = useArchive();

  const isArchived = isLoaded ? getStatus(slug, defaultArchived) : defaultArchived;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const oldState: ArchiveState = {
      archived: isArchived,
      manualOverride: defaultManualOverride,
    };

    const newState = toggleArchive({
      slug,
      defaultArchived,
      defaultManualOverride,
      pubDate,
      sourceDate,
    });

    if (onToggle) {
      onToggle(newState, oldState);
    }
  };

  const label = isArchived ? 'W archiwum' : 'Archiwizuj';
  const tooltip = isArchived ? 'Przywróć z archiwum' : 'Archiwizuj';
  const ariaLabel = isArchived
    ? `Przywróć ${title ? `„${title}” ` : ''}z archiwum`
    : `Zarchiwizuj ${title ? `„${title}” ` : ''}`;

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        aria-pressed={isArchived}
        title={tooltip}
        className={`inline-flex items-center gap-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer ${
          size === 'sm' ? 'px-3 py-1.5' : 'px-3.5 py-2'
        } ${
          isArchived
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 shadow-sm shadow-amber-500/10'
            : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 hover:border-amber-400/60 hover:text-amber-400 hover:bg-zinc-800'
        } ${className}`}
      >
        <ArchiveAIcon
          className={`transition-all duration-200 ${
            size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
          } ${isArchived ? 'text-amber-400 scale-105' : 'text-zinc-400 group-hover:text-amber-400'}`}
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
      aria-pressed={isArchived}
      title={tooltip}
      className={`rounded-full border transition-all duration-200 active:scale-90 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer ${
        size === 'sm' ? 'p-1.5' : 'p-2'
      } ${
        isArchived
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30 shadow-sm shadow-amber-500/10 scale-105 ring-1 ring-amber-400/30'
          : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-amber-400 hover:border-amber-400/50 hover:bg-zinc-800'
      } ${className}`}
    >
      <ArchiveAIcon
        className={`transition-transform duration-200 ${
          size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'
        } ${isArchived ? 'text-amber-400 scale-110' : ''}`}
      />
    </button>
  );
};
