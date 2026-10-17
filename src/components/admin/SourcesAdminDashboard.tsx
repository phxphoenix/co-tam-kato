import React, { useState, useMemo, useEffect } from 'react';
import {
  Database,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Pencil,
  Check,
  AlertCircle,
  X,
  Rss,
  Globe,
  Zap,
  CheckCircle2,
  Filter,
  Info,
} from 'lucide-react';
import AdminHeaderNav from './AdminHeaderNav';

export type SourceType = 'RSS' | 'WEB' | 'DYNAMIC_WEB';
export type SourceStatus = 'ACTIVE' | 'INACTIVE' | 'TEMPLATE' | string;

export interface EventSourceItem {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  category: string;
  status: SourceStatus;
  hints: string;
}

interface SourcesAdminDashboardProps {
  initialSources: EventSourceItem[];
  baseUrl?: string;
}

export default function SourcesAdminDashboard({
  initialSources = [],
  baseUrl = '/',
}: SourcesAdminDashboardProps) {
  const [sources, setSources] = useState<EventSourceItem[]>(initialSources);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RSS' | 'WEB' | 'DYNAMIC_WEB'>('ALL');

  // Stany akcji i ładowania
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Stany Modala
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pola formularza
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<SourceType>('WEB');
  const [formUrl, setFormUrl] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formHints, setFormHints] = useState('');
  const [formStatus, setFormStatus] = useState<SourceStatus>('ACTIVE');
  const [formErrors, setFormErrors] = useState<{ name?: string; url?: string; general?: string }>({});

  // Rozszerzony podgląd wskazówek
  const [expandedHintsId, setExpandedHintsId] = useState<string | null>(null);

  const cleanBase = baseUrl.replace(/\/$/, '');

  // Automatyczne ukrywanie powiadomienia Toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Odświeżenie listy z API
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${cleanBase}/api/sources`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nie udało się pobrać listy źródeł.');
      }
      setSources(data.sources);
      setToast({
        type: 'success',
        message: `Pomyślnie załadowano ${data.sources.length} źródeł z pliku config/sources.md`,
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        message: err?.message || 'Błąd podczas odświeżania listy źródeł.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Szybkie przełączanie statusu (Toggle Switch)
  const handleToggleStatus = async (source: EventSourceItem) => {
    const nextStatus = source.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setActionLoadingId(source.id);

    // Aktualizacja optymistyczna
    setSources((prev) =>
      prev.map((s) => (s.id === source.id ? { ...s, status: nextStatus } : s))
    );

    try {
      const res = await fetch(`${cleanBase}/api/sources`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Błąd podczas aktualizacji statusu');
      }

      setToast({
        type: 'success',
        message: `Zmieniono status źródła #${source.id} (${source.name}) na ${nextStatus}`,
      });
    } catch (err: any) {
      // Przywrócenie stanu przy błędzie
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, status: source.status } : s))
      );
      setToast({
        type: 'error',
        message: err?.message || 'Nie udało się zaktualizować statusu w pliku.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Otwarcie modala dodawania
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setFormName('');
    setFormType('WEB');
    setFormUrl('');
    setFormCategory('');
    setFormHints('');
    setFormStatus('ACTIVE');
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Otwarcie modala edycji
  const handleOpenEditModal = (source: EventSourceItem) => {
    setModalMode('edit');
    setEditingId(source.id);
    setFormName(source.name);
    setFormType(source.type);
    setFormUrl(source.url);
    setFormCategory(source.category || '');
    setFormHints(source.hints || '');
    setFormStatus(source.status);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Walidacja formularza
  const validateForm = () => {
    const errors: { name?: string; url?: string } = {};

    if (!formName.trim()) {
      errors.name = 'Nazwa źródła jest wymagana.';
    }

    if (!formUrl.trim()) {
      errors.url = 'Adres URL jest wymagany.';
    } else if (!/^https?:\/\//i.test(formUrl.trim())) {
      errors.url = 'Adres URL musi zaczynać się od http:// lub https://';
    } else {
      try {
        const u = new URL(formUrl.trim());
        if (!u.hostname.includes('.')) {
          errors.url = 'Nieprawidłowa domena w adresie URL.';
        }
      } catch {
        errors.url = 'Niepoprawny format adresu URL.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Zapis formularza (Dodanie lub Edycja)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setFormErrors({});

    try {
      if (modalMode === 'add') {
        const res = await fetch(`${cleanBase}/api/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            type: formType,
            url: formUrl.trim(),
            category: formCategory.trim(),
            hints: formHints.trim(),
            status: formStatus,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Nie udało się dodać nowego źródła.');
        }

        if (data.source) {
          setSources((prev) => [...prev, data.source]);
        } else if (data.sources) {
          setSources(data.sources);
        }

        setIsModalOpen(false);
        setToast({
          type: 'success',
          message: `Dodano nowe źródło #${data.source?.id} (${formName}) do config/sources.md!`,
        });
      } else {
        // Tryb edycji
        const res = await fetch(`${cleanBase}/api/sources`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            name: formName.trim(),
            type: formType,
            url: formUrl.trim(),
            category: formCategory.trim(),
            hints: formHints.trim(),
            status: formStatus,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Nie udało się zaktualizować źródła.');
        }

        setSources((prev) =>
          prev.map((s) => (s.id === editingId ? data.source || {
            ...s,
            name: formName.trim(),
            type: formType,
            url: formUrl.trim(),
            category: formCategory.trim(),
            hints: formHints.trim(),
            status: formStatus,
          } : s))
        );

        setIsModalOpen(false);
        setToast({
          type: 'success',
          message: `Pomyślnie zaktualizowano źródło #${editingId} w pliku config/sources.md`,
        });
      }
    } catch (err: any) {
      setFormErrors({ general: err?.message || 'Wystąpił błąd podczas zapisu.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Obliczenia KPI
  const stats = useMemo(() => {
    const total = sources.length;
    const active = sources.filter((s) => s.status === 'ACTIVE').length;
    const inactive = total - active;
    const rss = sources.filter((s) => s.type === 'RSS').length;
    const web = sources.filter((s) => s.type === 'WEB').length;
    const dynamicWeb = sources.filter((s) => s.type === 'DYNAMIC_WEB').length;
    return { total, active, inactive, rss, web, dynamicWeb };
  }, [sources]);

  // Filtrowanie źródeł
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      // Filtr statusu
      if (statusFilter === 'ACTIVE' && s.status !== 'ACTIVE') return false;
      if (statusFilter === 'INACTIVE' && s.status === 'ACTIVE') return false;

      // Filtr typu
      if (typeFilter !== 'ALL' && s.type !== typeFilter) return false;

      // Filtr wyszukiwania
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchUrl = s.url.toLowerCase().includes(q);
        const matchCategory = s.category?.toLowerCase().includes(q);
        const matchHints = s.hints?.toLowerCase().includes(q);
        const matchId = String(s.id).includes(q);
        return matchName || matchUrl || matchCategory || matchHints || matchId;
      }

      return true;
    });
  }, [sources, statusFilter, typeFilter, searchQuery]);

  // Pomocniczy komponent badge typu
  const renderTypeBadge = (type: SourceType) => {
    switch (type) {
      case 'RSS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
            <Rss className="w-3 h-3 shrink-0" />
            RSS
          </span>
        );
      case 'WEB':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 whitespace-nowrap">
            <Globe className="w-3 h-3 shrink-0" />
            WEB
          </span>
        );
      case 'DYNAMIC_WEB':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 whitespace-nowrap">
            <Zap className="w-3 h-3 shrink-0" />
            DYNAMIC_WEB
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Pasek nawigacyjny modułów Admina */}
      <AdminHeaderNav currentTab="sources" baseUrl={baseUrl} />

      {/* Nagłówek sekcji Źródeł */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-2">
            <Database className="w-3.5 h-3.5" />
            <span>Single Source of Truth: config/sources.md</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100 flex items-center gap-3">
            <span>Źródła Wydarzeń</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Przeglądaj, filtruj i edytuj listę źródeł wydarzeń. Każda zmiana jest bezpośrednio zapisywana do pliku{' '}
            <code className="text-amber-300 font-mono text-xs bg-zinc-900 px-1 py-0.5 rounded">config/sources.md</code>, zachowując instrukcje dla Agenta AI.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition disabled:opacity-50 cursor-pointer"
            title="Przeładuj źródła z pliku"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>Odśwież</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 shadow-lg shadow-amber-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Dodaj nowe źródło</span>
          </button>
        </div>
      </div>

      {/* KPI Podsumowanie */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Wszystkie źródła
          </div>
          <div className="text-2xl font-black text-zinc-100">{stats.total}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Łącznie w tabeli</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Aktywne (ACTIVE)
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.active}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Pobierane przez pipeline</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Nieaktywne (INACTIVE)
          </div>
          <div className="text-2xl font-black text-zinc-400">{stats.inactive}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Ignorowane przez Agenta</div>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Typy źródeł
          </div>
          <div className="text-xs font-mono text-zinc-300 space-y-0.5 mt-1">
            <div><span className="text-amber-400 font-bold">{stats.rss}</span> RSS</div>
            <div><span className="text-sky-400 font-bold">{stats.web}</span> WEB</div>
            <div><span className="text-purple-400 font-bold">{stats.dynamicWeb}</span> DYNAMIC_WEB</div>
          </div>
        </div>
      </div>

      {/* Toast powiadomienie */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-sm transition-all shadow-lg animate-in fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-zinc-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pasek filtrowania i wyszukiwania */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-zinc-900/60 border border-zinc-800/80 p-3.5 rounded-2xl">
        {/* Wyszukiwarka */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj po nazwie, URL, kategorii, ID lub wskazówkach..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtry */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Wszystkie ({sources.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Aktywne ({stats.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Nieaktywne ({stats.inactive})
            </button>
          </div>

          {/* Type filter */}
          <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setTypeFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                typeFilter === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Wszystkie typy
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('RSS')}
              className={`px-2 py-1 rounded-lg font-medium transition cursor-pointer ${
                typeFilter === 'RSS'
                  ? 'bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              RSS
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('WEB')}
              className={`px-2 py-1 rounded-lg font-medium transition cursor-pointer ${
                typeFilter === 'WEB'
                  ? 'bg-sky-500/20 text-sky-400 font-semibold border border-sky-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              WEB
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('DYNAMIC_WEB')}
              className={`px-2 py-1 rounded-lg font-medium transition cursor-pointer ${
                typeFilter === 'DYNAMIC_WEB'
                  ? 'bg-purple-500/20 text-purple-400 font-semibold border border-purple-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              DYNAMIC_WEB
            </button>
          </div>
        </div>
      </div>

      {/* Tabela Źródeł */}
      <div className="border border-zinc-800/80 rounded-2xl bg-zinc-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
                <th className="py-3 px-3 sm:px-4 w-12 text-center">ID</th>
                <th className="py-3 px-3 sm:px-4 min-w-[180px]">Nazwa źródła</th>
                <th className="py-3 px-3 sm:px-4 min-w-[110px]">Typ</th>
                <th className="py-3 px-3 sm:px-4 min-w-[200px]">Adres URL</th>
                <th className="py-3 px-3 sm:px-4 min-w-[140px]">Kategoria</th>
                <th className="py-3 px-3 sm:px-4 min-w-[240px]">Wskazówki dla Agenta</th>
                <th className="py-3 px-3 sm:px-4 min-w-[140px] text-center">Status / Przełącznik</th>
                <th className="py-3 px-3 sm:px-4 w-20 text-center">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredSources.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    <Database className="w-8 h-8 mx-auto text-zinc-600 mb-2 opacity-50" />
                    <span>Brak źródeł spełniających kryteria wyszukiwania.</span>
                  </td>
                </tr>
              ) : (
                filteredSources.map((source) => {
                  const isActive = source.status === 'ACTIVE';
                  const isLoading = actionLoadingId === source.id;
                  const isExpanded = expandedHintsId === source.id;

                  return (
                    <tr
                      key={source.id}
                      className={`hover:bg-zinc-800/30 transition-colors ${
                        !isActive ? 'opacity-75 bg-zinc-950/20' : ''
                      }`}
                    >
                      {/* ID */}
                      <td className="py-3.5 px-3 sm:px-4 text-center font-mono text-zinc-400 font-bold">
                        #{source.id}
                      </td>

                      {/* Nazwa */}
                      <td className="py-3.5 px-3 sm:px-4">
                        <div className="font-bold text-zinc-100 flex items-center gap-1.5">
                          <span>{source.name}</span>
                        </div>
                      </td>

                      {/* Typ */}
                      <td className="py-3.5 px-3 sm:px-4">
                        {renderTypeBadge(source.type)}
                      </td>

                      {/* URL */}
                      <td className="py-3.5 px-3 sm:px-4">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-amber-400 font-mono text-xs transition max-w-[240px] truncate group"
                          title={source.url}
                        >
                          <span className="truncate">{source.url.replace(/^https?:\/\//, '')}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-zinc-500 group-hover:text-amber-400 transition" />
                        </a>
                      </td>

                      {/* Kategoria */}
                      <td className="py-3.5 px-3 sm:px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 max-w-[160px] truncate" title={source.category}>
                          {source.category || '—'}
                        </span>
                      </td>

                      {/* Wskazówki */}
                      <td className="py-3.5 px-3 sm:px-4 text-xs text-zinc-400">
                        {source.hints ? (
                          <div>
                            <p
                              className={`${
                                isExpanded ? 'whitespace-normal' : 'line-clamp-2'
                              } leading-relaxed cursor-pointer hover:text-zinc-200 transition`}
                              onClick={() =>
                                setExpandedHintsId(isExpanded ? null : source.id)
                              }
                              title="Kliknij, aby rozwinąć/zwinąć treść"
                            >
                              {source.hints}
                            </p>
                            {source.hints.length > 80 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedHintsId(isExpanded ? null : source.id)
                                }
                                className="text-[10px] text-amber-400/80 hover:text-amber-300 mt-0.5 font-semibold cursor-pointer"
                              >
                                {isExpanded ? 'Zwiń ▲' : 'Więcej... ▼'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">Brak wskazówek</span>
                        )}
                      </td>

                      {/* Status / Toggle Switch */}
                      <td className="py-3.5 px-3 sm:px-4">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isActive}
                            disabled={isLoading}
                            onClick={() => handleToggleStatus(source)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
                              isActive ? 'bg-emerald-500' : 'bg-zinc-700'
                            } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                            title={`Przełącz na ${isActive ? 'INACTIVE' : 'ACTIVE'}`}
                          >
                            <span className="sr-only">Przełącz status źródła</span>
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                isActive ? 'translate-x-5' : 'translate-x-0'
                              } ${isLoading ? 'scale-90 opacity-70' : ''}`}
                            />
                          </button>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isActive ? 'text-emerald-400' : 'text-zinc-500'
                            }`}
                          >
                            {isLoading ? 'Zapisuję...' : source.status}
                          </span>
                        </div>
                      </td>

                      {/* Akcje */}
                      <td className="py-3.5 px-3 sm:px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(source)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition cursor-pointer"
                          title="Edytuj dane źródła"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Stopka tabeli z liczbą rekordów */}
        <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Wyświetlono {filteredSources.length} z {sources.length} źródeł
          </span>
          <span className="font-mono text-[11px]">config/sources.md</span>
        </div>
      </div>

      {/* Modal: Dodawanie / Edycja Źródła */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Nagłówek modala */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  {modalMode === 'add' ? <Plus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">
                    {modalMode === 'add' ? 'Dodaj nowe źródło wydarzeń' : `Edycja źródła #${editingId}`}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {modalMode === 'add'
                      ? 'Źródło zostanie dopisane na końcu tabeli w config/sources.md'
                      : 'Zmiany zostaną bezpiecznie zapisane w config/sources.md'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ciało modala / Formularz */}
            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 overflow-y-auto">
              {formErrors.general && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formErrors.general}</span>
                </div>
              )}

              {/* Nazwa */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Nazwa źródła <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="np. Klub Muzyczny P23 Katowice"
                  className={`w-full px-3.5 py-2.5 bg-zinc-950 border rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition ${
                    formErrors.name
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-zinc-800 focus:border-amber-400'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Rząd 2: Typ i Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Typ */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Typ metody pobierania <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as SourceType)}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-amber-400 transition"
                  >
                    <option value="WEB">WEB (Standardowy HTML / Cheerio)</option>
                    <option value="RSS">RSS (Kanał XML / Atom)</option>
                    <option value="DYNAMIC_WEB">DYNAMIC_WEB (JavaScript / Headless SPA)</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Status początkowy <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-amber-400 transition"
                  >
                    <option value="ACTIVE">ACTIVE (Aktywne w pipeline)</option>
                    <option value="INACTIVE">INACTIVE (Ignorowane / Wstrzymane)</option>
                  </select>
                </div>
              </div>

              {/* Adres URL */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Adres URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://domena.pl/wydarzenia"
                  className={`w-full px-3.5 py-2.5 bg-zinc-950 border rounded-xl text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none transition ${
                    formErrors.url
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-zinc-800 focus:border-amber-400'
                  }`}
                />
                {formErrors.url && (
                  <p className="text-xs text-rose-400 mt-1">{formErrors.url}</p>
                )}
              </div>

              {/* Kategoria */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Domyślna kategoria (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="np. Muzyka / Koncerty, Kultura, Miejskie"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              {/* Wskazówki dla Agenta (Scraping Hints) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Wskazówki dla agenta AI (Scraping Hints)
                </label>
                <textarea
                  rows={3}
                  value={formHints}
                  onChange={(e) => setFormHints(e.target.value)}
                  placeholder="Instrukcja ekstrakcji, np. Szukaj listy nadchodzących koncertów. Pobieraj tytuł, dokładną datę oraz link do biletów..."
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition resize-y"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Znaki specjalne (np. kreski <code className="text-amber-400">|</code>) zostaną automatycznie bezpiecznie zabezpieczone podczas zapisu do tabeli.
                </p>
              </div>

              {/* Przyciski akcji modala */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md shadow-amber-400/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Zapisuję...</span>
                    </>
                  ) : modalMode === 'add' ? (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Dodaj źródło</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Zapisz zmiany</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
