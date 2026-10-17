import React, { useState, useMemo } from 'react';
import {
  Archive,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Search,
  RefreshCw,
  Sliders,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Check,
} from 'lucide-react';
import { validateArchivePeriod } from '../../lib/archive-validation';
import AdminHeaderNav from './AdminHeaderNav';

export interface AdminArticleItem {
  slug: string;
  title: string;
  pubDate: string;
  sourceDate?: string;
  status: string;
  archived: boolean;
  manualOverride: boolean;
  city?: string;
  category?: string;
}

export interface ArchiveWorkerResult {
  executed: boolean;
  timestamp: string;
  archiveAfterDays: number;
  totalScanned: number;
  archivedCount: number;
  alreadyArchivedCount: number;
  protectedByOverrideCount: number;
  errorsCount: number;
  archivedArticles: Array<{
    file: string;
    title: string;
    pubDate: string;
    diffDays: number;
  }>;
}

interface ArchiveAdminDashboardProps {
  initialDays: number;
  initialArticles: AdminArticleItem[];
  baseUrl?: string;
}

export default function ArchiveAdminDashboard({
  initialDays = 10,
  initialArticles = [],
  baseUrl = '/',
}: ArchiveAdminDashboardProps) {
  // Stan konfiguracji
  const [daysInput, setDaysInput] = useState<string>(String(initialDays));
  const [currentDays, setCurrentDays] = useState<number>(initialDays);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Stan workera "Uruchom teraz"
  const [isRunningWorker, setIsRunningWorker] = useState(false);
  const [workerResult, setWorkerResult] = useState<ArchiveWorkerResult | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  // Stan artykułów
  const [articles, setArticles] = useState<AdminArticleItem[]>(initialArticles);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'archived' | 'active' | 'override'>('all');
  const [actionLoadingSlug, setActionLoadingSlug] = useState<string | null>(null);

  // Walidacja pola okresu archiwizacji w locie
  const validation = useMemo(() => {
    return validateArchivePeriod(daysInput);
  }, [daysInput]);

  // Obliczenia statystyk
  const stats = useMemo(() => {
    const total = articles.length;
    const archived = articles.filter((a) => a.archived).length;
    const active = total - archived;
    const overrides = articles.filter((a) => a.manualOverride).length;
    return { total, archived, active, overrides };
  }, [articles]);

  // Zapisywanie konfiguracji
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid || validation.value === undefined) {
      setSettingsFeedback({
        type: 'error',
        message: validation.error || 'Wprowadź poprawną liczbę dni (1 - 365).',
      });
      return;
    }

    setIsSavingSettings(true);
    setSettingsFeedback(null);

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/archive-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveAfterDays: validation.value }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Błąd zapisu ustawień.');
      }

      setCurrentDays(validation.value);
      setSettingsFeedback({
        type: 'success',
        message: `Pomyślnie zapisano okres archiwizacji: ${validation.value} dni. Nocny worker użyje tej wartości przy kolejnym biegu.`,
      });
    } catch (err: any) {
      setSettingsFeedback({
        type: 'error',
        message: err?.message || 'Wystąpił błąd podczas zapisywania konfiguracji.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Ręczne uruchomienie workera ("Uruchom teraz")
  const handleRunWorkerNow = async () => {
    setIsRunningWorker(true);
    setWorkerError(null);
    setWorkerResult(null);

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/archive-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customDays: validation.valid ? validation.value : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Błąd wykonania workera.');
      }

      setWorkerResult(data);

      // Aktualizacja stanu lokalnego artykułów, które zostały zarchiwizowane
      if (Array.isArray(data.archivedArticles) && data.archivedArticles.length > 0) {
        const newlyArchivedFiles = new Set(data.archivedArticles.map((a: any) => a.file));
        setArticles((prev) =>
          prev.map((art) => {
            const matches =
              newlyArchivedFiles.has(`${art.slug}.md`) ||
              newlyArchivedFiles.has(`${art.slug}.mdx`) ||
              data.archivedArticles.some((x: any) => x.title === art.title);
            if (matches) {
              return { ...art, archived: true };
            }
            return art;
          })
        );
      }
    } catch (err: any) {
      setWorkerError(err?.message || 'Wystąpił błąd podczas uruchamiania workera.');
    } finally {
      setIsRunningWorker(false);
    }
  };

  // Ręczne przełączenie pojedynczego artykułu (Archiwizuj / Przywróć)
  const handleToggleArticle = async (article: AdminArticleItem) => {
    const nextArchived = !article.archived;
    const nextManualOverride = nextArchived ? false : true;

    setActionLoadingSlug(article.slug);

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: article.slug,
          archived: nextArchived,
          manualOverride: nextManualOverride,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nie udało się zaktualizować statusu artykułu.');
      }

      setArticles((prev) =>
        prev.map((a) =>
          a.slug === article.slug
            ? { ...a, archived: nextArchived, manualOverride: nextManualOverride }
            : a
        )
      );
    } catch (err: any) {
      alert(`Błąd: ${err?.message || 'Nie udało się zmienić statusu artykułu'}`);
    } finally {
      setActionLoadingSlug(null);
    }
  };

  // Filtrowanie artykułów do tabeli
  const filteredArticles = useMemo(() => {
    return articles.filter((item) => {
      if (statusFilter === 'archived' && !item.archived) return false;
      if (statusFilter === 'active' && item.archived) return false;
      if (statusFilter === 'override' && !item.manualOverride) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchSlug = item.slug.toLowerCase().includes(q);
        const matchCity = item.city?.toLowerCase().includes(q);
        return matchTitle || matchSlug || matchCity;
      }
      return true;
    });
  }, [articles, statusFilter, searchQuery]);

  return (
    <div className="space-y-8">
      {/* Pasek nawigacyjny modułów Admina */}
      <AdminHeaderNav currentTab="archive" baseUrl={baseUrl} />

      {/* Pasek nawigacyjny i nagłówek panelu */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            <Sliders className="w-3.5 h-3.5" />
            <span>Panel Zarządzania Archiwizacją</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100 flex items-center gap-3">
            <Archive className="w-8 h-8 text-amber-400" />
            Sekcja „Archive”
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Konfiguracja czasu retencji wiadomości, natychmiastowe przeliczanie archiwum na żądanie oraz podgląd flagi{' '}
            <code className="text-amber-300 font-mono text-xs bg-zinc-900 px-1 py-0.5 rounded">Archived (True / False)</code> na liście wpisów.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={`${baseUrl.replace(/\/$/, '')}/keystatic`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition border border-zinc-700"
          >
            <span>Keystatic CMS</span>
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
          <a
            href={`${baseUrl.replace(/\/$/, '')}/archiwum`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition border border-amber-500/30"
          >
            <span>Podgląd Archiwum w portalu</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Podsumowanie liczbowe (KPI Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Okres retencji
          </div>
          <div className="text-2xl font-black text-amber-400 flex items-baseline gap-1">
            {currentDays} <span className="text-xs font-medium text-zinc-400">dni</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">Domyślnie: 10 dni</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Wszystkie wpisy
          </div>
          <div className="text-2xl font-black text-zinc-100">{stats.total}</div>
          <div className="text-[11px] text-zinc-400 mt-1">Łącznie w bazie</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            W widoku głównym
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.active}</div>
          <div className="text-[11px] text-zinc-400 mt-1">Archived = False</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            W Archiwum
          </div>
          <div className="text-2xl font-black text-indigo-400">{stats.archived}</div>
          <div className="text-[11px] text-zinc-400 mt-1">Archived = True</div>
        </div>
      </div>

      {/* Dwa główne bloki kontrolne: Konfiguracja okresu retencji + Przycisk "Uruchom teraz" */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Karta 1: Konfiguracja okresu archiwizacji */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Konfiguracja okresu archiwizacji</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Określ, po ilu dniach od publikacji artykuł ma zostać automatycznie przeniesiony do Archiwum przez nocny
              proces o 02:00 czasu polskiego.
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label htmlFor="archiveAfterDaysInput" className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Okres archiwizacji (w dniach, min: 1, max: 365):
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      id="archiveAfterDaysInput"
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={daysInput}
                      onChange={(e) => setDaysInput(e.target.value)}
                      className={`w-full bg-zinc-950 border px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 transition ${
                        validation.valid
                          ? 'border-zinc-700 focus:ring-amber-500/40 focus:border-amber-400'
                          : 'border-rose-500/80 focus:ring-rose-500/40 focus:border-rose-500'
                      }`}
                      placeholder="10"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">
                      dni
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={!validation.valid || isSavingSettings}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md cursor-pointer shrink-0"
                  >
                    {isSavingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Zapisywanie...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Zapisz konfigurację</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Komunikaty walidacji pola */}
                {!validation.valid && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{validation.error}</span>
                  </div>
                )}

                {/* Informacja o domyślnej wartości */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2 px-1">
                  <span>Domyślna wartość w systemie: 10 dni</span>
                  <button
                    type="button"
                    onClick={() => setDaysInput('10')}
                    className="text-amber-400/80 hover:text-amber-400 hover:underline cursor-pointer"
                  >
                    Przywróć domyślne (10)
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Feedback po zapisaniu */}
          {settingsFeedback && (
            <div
              className={`mt-4 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                settingsFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              {settingsFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{settingsFeedback.message}</span>
            </div>
          )}
        </div>

        {/* Karta 2: Ręczne wyzwolenie workera ("Uruchom teraz") */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Play className="w-5 h-5 fill-indigo-400/20" />
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Przycisk „Uruchom teraz” / Przelicz archiwum</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Wyzwól proces automatycznej archiwizacji natychmiast na żądanie. Przydatne do testów, natychmiastowego
              odświeżenia widoków lub po skróceniu czasu retencji.
            </p>

            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 mb-4 text-xs text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Zachowanie procesu na żądanie:</span>
              </div>
              <p>
                Worker przeskanuje wszystkie artykuły z <code className="text-zinc-200">Archived = False</code>. Artykuły
                starsze niż skonfigurowany okres ({validation.valid ? validation.value : currentDays} dni) otrzymają flagę{' '}
                <code className="text-amber-300">Archived = True</code>.
              </p>
              <p className="text-zinc-400">
                Wpisy oznaczone ręcznym przywróceniem (<code className="text-zinc-300">ManualOverride = True</code>) są
                chronione przed ponowną auto-archiwizacją.
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleRunWorkerNow}
              disabled={isRunningWorker || !validation.valid}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg cursor-pointer"
            >
              {isRunningWorker ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Wykonywanie procesu archiwizacji...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-zinc-950" />
                  <span>Uruchom teraz (Przelicz archiwum)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Raport z wykonania workera (jeśli został uruchomiony) */}
      {workerResult && (
        <div className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-xl transition-all">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-100">Raport wykonania workera na żądanie</h3>
            </div>
            <span className="text-xs text-zinc-400 font-mono">{workerResult.timestamp}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px]">Przeskanowano</div>
              <div className="text-base font-bold text-zinc-100">{workerResult.totalScanned}</div>
            </div>
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px]">Nowo zarchiwizowane</div>
              <div className="text-base font-bold text-amber-400">+{workerResult.archivedCount}</div>
            </div>
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px]">Już w archiwum</div>
              <div className="text-base font-bold text-zinc-300">{workerResult.alreadyArchivedCount}</div>
            </div>
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px]">Ochrona ManualOverride</div>
              <div className="text-base font-bold text-indigo-400">{workerResult.protectedByOverrideCount}</div>
            </div>
            <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px]">Błędy</div>
              <div className={`text-base font-bold ${workerResult.errorsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {workerResult.errorsCount}
              </div>
            </div>
          </div>

          {workerResult.archivedArticles && workerResult.archivedArticles.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800 text-xs">
              <div className="font-semibold text-zinc-300 mb-1.5">
                Artykuły przeniesione do archiwum w tym przebiegu ({workerResult.archivedArticles.length}):
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {workerResult.archivedArticles.map((art, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300"
                  >
                    <Archive className="w-3 h-3 text-amber-400" />
                    <span className="font-medium truncate max-w-xs">{art.title}</span>
                    <span className="text-zinc-400 text-[10px]">({art.diffDays} dni temu)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {workerError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>Błąd wykonania: {workerError}</span>
        </div>
      )}

      {/* Lista artykułów z kolumną / flagą Archived (True / False) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <span>Status Archiwizacji Artykułów</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                {filteredArticles.length} / {articles.length}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Jednoznaczny podgląd flagi <strong className="text-zinc-200">Archived (True / False)</strong> oraz możliwość
              szybkiego manualnego przełączenia.
            </p>
          </div>

          {/* Filtry i wyszukiwarka */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Szukaj wpisu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 pl-8 pr-3 py-1.5 rounded-xl focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Wszystkie ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Główna ({stats.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('archived')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'archived'
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Archiwum ({stats.archived})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('override')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === 'override'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🛡️ Override ({stats.overrides})
              </button>
            </div>
          </div>
        </div>

        {/* Tabela artykułów */}
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/80 text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-800">
              <tr>
                <th scope="col" className="px-4 py-3">Tytuł wpisu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap">Data publikacji</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap text-center">Status wpisu</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap text-center">ManualOverride</th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap text-center font-bold text-zinc-200">
                  Flaga Archived
                </th>
                <th scope="col" className="px-4 py-3 whitespace-nowrap text-right">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-medium">
              {filteredArticles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Brak artykułów spełniających wybrane kryteria filtrowania.
                  </td>
                </tr>
              ) : (
                filteredArticles.map((art) => {
                  const isActionLoading = actionLoadingSlug === art.slug;
                  const pubDateFormatted = (art.sourceDate || art.pubDate).slice(0, 10);

                  return (
                    <tr key={art.slug} className="hover:bg-zinc-800/30 transition">
                      {/* Tytuł */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                          <a
                            href={`${baseUrl.replace(/\/$/, '')}/wpis/${art.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-amber-400 transition hover:underline"
                          >
                            {art.title}
                          </a>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{art.slug}</div>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400 font-mono">
                        {pubDateFormatted}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            art.status === 'published'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : art.status === 'draft'
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {art.status}
                        </span>
                      </td>

                      {/* ManualOverride */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {art.manualOverride ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            <Shield className="w-3 h-3 text-indigo-400" />
                            <span>True</span>
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Kolumna Archived (True / False) */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {art.archived ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            <Archive className="w-3.5 h-3.5 text-indigo-400" />
                            <span>True (Archiwum)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>False (Główna)</span>
                          </span>
                        )}
                      </td>

                      {/* Szybka akcja */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleArticle(art)}
                          disabled={isActionLoading}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                            art.archived
                              ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                          } disabled:opacity-50`}
                          title={art.archived ? 'Przywróć artykuł na stronę główną' : 'Przenieś artykuł do archiwum'}
                        >
                          {isActionLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : art.archived ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Przywróć</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3.5 h-3.5" />
                              <span>Zarchiwizuj</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
