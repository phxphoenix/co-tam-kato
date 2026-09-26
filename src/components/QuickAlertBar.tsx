import React, { useState } from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';

interface QuickAlertProps {
  alerts: Array<{
    id: string;
    title: string;
    summary: string;
    city: string;
    slug: string;
  }>;
}

export const QuickAlertBar: React.FC<QuickAlertProps> = ({ alerts }) => {
  const [dismissed, setDismissed] = useState(false);
  const rawBase = import.meta.env.BASE_URL || '/';
  const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  if (dismissed || !alerts || alerts.length === 0) {
    return null;
  }

  const firstAlert = alerts[0];

  return (
    <div className="bg-gradient-to-r from-rose-950/80 via-amber-950/60 to-rose-950/80 border-b border-rose-500/30 text-rose-100 py-2.5 px-4 backdrop-blur-md transition-all">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-2 w-2 relative flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="font-semibold text-amber-300 uppercase tracking-wider text-xs hidden sm:inline">
            Pilny komunikat:
          </span>
          <span className="font-medium truncate text-zinc-100">
            {firstAlert.title}
          </span>
          <a
            href={`${baseUrl}wpis/${firstAlert.slug}`}
            className="hidden md:inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2 flex-shrink-0"
          >
            Szczegóły <ChevronRight className="w-3 h-3" />
          </a>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800/50 flex-shrink-0 transition-colors"
          title="Zamknij powiadomienie"
          aria-label="Zamknij alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
