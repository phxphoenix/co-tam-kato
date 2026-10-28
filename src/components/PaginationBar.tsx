import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPaginationMeta, getPaginationPages } from '../lib/pagination';

export interface PaginationBarProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (newSize: number) => void;
  position?: 'top' | 'bottom';
  compact?: boolean;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  position = 'bottom',
  compact = false,
}) => {
  const { safeCurrentPage, totalPages, startItem, endItem } = getPaginationMeta(
    currentPage,
    pageSize,
    totalItems
  );

  const pageTokens = getPaginationPages(safeCurrentPage, totalPages);
  const hasSizeSelector = Boolean(pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange);

  return (
    <nav
      aria-label={`Nawigacja stron (${position === 'top' ? 'górna' : 'dolna'})`}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${
        compact
          ? 'bg-zinc-950/60 border border-zinc-800/80 rounded-xl px-3.5 py-2.5'
          : 'bg-zinc-900/70 border border-zinc-800/80 rounded-2xl px-4 py-3 shadow-md backdrop-blur-sm'
      }`}
    >
      {/* Licznik artykułów + opcjonalny selektor limitu na stronę */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 text-xs text-zinc-400 w-full sm:w-auto">
        <span>
          Wyświetlanie <strong className="text-zinc-100 font-semibold">{startItem}–{endItem}</strong> z{' '}
          <strong className="text-zinc-100 font-semibold">{totalItems}</strong> artykułów
        </span>

        {hasSizeSelector && pageSizeOptions && onPageSizeChange && (
          <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <span className="text-zinc-500 hidden xs:inline">•</span>
            <span>Na stronę:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (Number.isInteger(val) && val > 0) {
                  onPageSizeChange(val);
                }
              }}
              aria-label="Liczba artykułów na stronę"
              className="bg-zinc-950 border border-zinc-700 hover:border-zinc-600 focus:border-amber-400 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-100 focus:outline-none transition cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Pasek numerów stron ze skracaniem wielokropkiem */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1}
            aria-label="Poprzednia strona"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-950/90 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Poprzednia</span>
          </button>

          <div className="flex items-center gap-1">
            {pageTokens.map((token, idx) => {
              if (token === 'ellipsis') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    aria-hidden="true"
                    className="px-1.5 py-1 text-xs font-semibold text-zinc-500 select-none"
                  >
                    …
                  </span>
                );
              }

              const isCurrent = token === safeCurrentPage;
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => onPageChange(token)}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`Strona ${token}`}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition border cursor-pointer ${
                    isCurrent
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-md shadow-amber-400/20'
                      : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-700'
                  }`}
                >
                  {token}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= totalPages}
            aria-label="Następna strona"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-zinc-800 bg-zinc-950/90 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <span className="hidden md:inline">Następna</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </nav>
  );
};
