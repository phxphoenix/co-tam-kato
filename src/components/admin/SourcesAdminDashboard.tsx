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
  Sliders,
  LayoutGrid,
  RotateCcw,
  Bot,
  ChevronDown,
  ChevronUp,
  Scale,
} from 'lucide-react';
import AdminHeaderNav from './AdminHeaderNav';
import {
  GRID_RECOMMENDED_MULTIPLES,
  ADMIN_ARCHIVE_PAGE_SIZE_OPTIONS,
  PAGINATION_STORAGE_KEYS,
} from '../../lib/pagination';

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

export interface PaginationSettings {
  homePageSize: number;
  archivePageSize: number;
  adminArchivePageSize: number;
}

export interface BalanceSettings {
  maxArticlesPerRun: number;
  maxCandidates: number;
  ticketedMaxShare3d: number;
  rssPoolShare: number;
  ticketedMaxPerRun: number;
  ticketedMaxPerDay: number;
  ticketedMinPerDay: number;
  nosprMaxPerRun: number;
  nosprMaxPerDay: number;
  otherVenueMaxPerDay: number;
  lastTicketsBonusPerDay: number;
  poolMaxItemsPerTicketedSource: number;
  maxPromptItems: number;
  cycleCooldownDays: number;
  weeklySummaryEnabled: boolean;
  weeklySummaryHorizonDays: number;
}

interface SourcesAdminDashboardProps {
  initialSources: EventSourceItem[];
  initialPaginationSettings?: PaginationSettings;
  initialBalanceSettings?: BalanceSettings;
  baseUrl?: string;
}

const DEFAULT_PAGINATION: PaginationSettings = {
  homePageSize: 12,
  archivePageSize: 24,
  adminArchivePageSize: 25,
};

const DEFAULT_BALANCE_SETTINGS: BalanceSettings = {
  maxArticlesPerRun: 4,
  maxCandidates: 7,
  ticketedMaxShare3d: 0.40,
  rssPoolShare: 0.50,
  ticketedMaxPerRun: 2,
  ticketedMaxPerDay: 3,
  ticketedMinPerDay: 1,
  nosprMaxPerRun: 1,
  nosprMaxPerDay: 2,
  otherVenueMaxPerDay: 1,
  lastTicketsBonusPerDay: 1,
  poolMaxItemsPerTicketedSource: 5,
  maxPromptItems: 60,
  cycleCooldownDays: 7,
  weeklySummaryEnabled: true,
  weeklySummaryHorizonDays: 14,
};

type BalanceNumericKey = Exclude<keyof BalanceSettings, 'weeklySummaryEnabled'>;
type BalanceInputState = Record<BalanceNumericKey, string> & { weeklySummaryEnabled: boolean };

function balanceToInputs(s: BalanceSettings): BalanceInputState {
  return {
    maxArticlesPerRun: String(s.maxArticlesPerRun),
    maxCandidates: String(s.maxCandidates),
    ticketedMaxShare3d: String(Math.round(s.ticketedMaxShare3d * 100)),
    rssPoolShare: String(Math.round(s.rssPoolShare * 100)),
    ticketedMaxPerRun: String(s.ticketedMaxPerRun),
    ticketedMaxPerDay: String(s.ticketedMaxPerDay),
    ticketedMinPerDay: String(s.ticketedMinPerDay),
    nosprMaxPerRun: String(s.nosprMaxPerRun),
    nosprMaxPerDay: String(s.nosprMaxPerDay),
    otherVenueMaxPerDay: String(s.otherVenueMaxPerDay),
    lastTicketsBonusPerDay: String(s.lastTicketsBonusPerDay),
    poolMaxItemsPerTicketedSource: String(s.poolMaxItemsPerTicketedSource),
    maxPromptItems: String(s.maxPromptItems),
    cycleCooldownDays: String(s.cycleCooldownDays),
    weeklySummaryEnabled: Boolean(s.weeklySummaryEnabled),
    weeklySummaryHorizonDays: String(s.weeklySummaryHorizonDays),
  };
}

export default function SourcesAdminDashboard({
  initialSources = [],
  initialPaginationSettings = DEFAULT_PAGINATION,
  initialBalanceSettings = DEFAULT_BALANCE_SETTINGS,
  baseUrl = '/',
}: SourcesAdminDashboardProps) {
  const [sources, setSources] = useState<EventSourceItem[]>(initialSources);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RSS' | 'WEB' | 'DYNAMIC_WEB'>('ALL');

  // Stany ustawień paginacji
  const [homePageSizeInput, setHomePageSizeInput] = useState<string>(
    String(initialPaginationSettings?.homePageSize ?? DEFAULT_PAGINATION.homePageSize)
  );
  const [archivePageSizeInput, setArchivePageSizeInput] = useState<string>(
    String(initialPaginationSettings?.archivePageSize ?? DEFAULT_PAGINATION.archivePageSize)
  );
  const [adminArchivePageSizeInput, setAdminArchivePageSizeInput] = useState<string>(
    String(initialPaginationSettings?.adminArchivePageSize ?? DEFAULT_PAGINATION.adminArchivePageSize)
  );
  const [savedPagination, setSavedPagination] = useState<PaginationSettings>({
    homePageSize: initialPaginationSettings?.homePageSize ?? DEFAULT_PAGINATION.homePageSize,
    archivePageSize: initialPaginationSettings?.archivePageSize ?? DEFAULT_PAGINATION.archivePageSize,
    adminArchivePageSize:
      initialPaginationSettings?.adminArchivePageSize ?? DEFAULT_PAGINATION.adminArchivePageSize,
  });
  const [isSavingPagination, setIsSavingPagination] = useState(false);
  const [paginationFeedback, setPaginationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Stany konfiguracji Workera AI i proporcji treści
  const mergedInitialBalance: BalanceSettings = {
    ...DEFAULT_BALANCE_SETTINGS,
    ...(initialBalanceSettings || {}),
  };
  const [balanceInputs, setBalanceInputs] = useState<BalanceInputState>(() =>
    balanceToInputs(mergedInitialBalance)
  );
  const [savedBalanceSettings, setSavedBalanceSettings] =
    useState<BalanceSettings>(mergedInitialBalance);
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [isAdvancedBalanceOpen, setIsAdvancedBalanceOpen] = useState(false);
  const [balanceFeedback, setBalanceFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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

  // Walidacja pól paginacji w locie
  const paginationValidation = useMemo(() => {
    const h = parseInt(homePageSizeInput, 10);
    const a = parseInt(archivePageSizeInput, 10);
    const adm = parseInt(adminArchivePageSizeInput, 10);

    if (!Number.isInteger(h) || h < 1 || h > 500) {
      return {
        valid: false,
        error: 'Rozmiar strony głównej (homePageSize) musi być liczbą całkowitą od 1 do 500.',
      };
    }
    if (!Number.isInteger(a) || a < 1 || a > 500) {
      return {
        valid: false,
        error: 'Rozmiar strony archiwum (archivePageSize) musi być liczbą całkowitą od 1 do 500.',
      };
    }
    if (!Number.isInteger(adm) || adm < 1 || adm > 500) {
      return {
        valid: false,
        error: 'Rozmiar strony Panelu Archive (adminArchivePageSize) musi być liczbą całkowitą od 1 do 500.',
      };
    }

    return {
      valid: true,
      values: {
        homePageSize: h,
        archivePageSize: a,
        adminArchivePageSize: adm,
      },
    };
  }, [homePageSizeInput, archivePageSizeInput, adminArchivePageSizeInput]);

  // Zapis ustawień paginacji do config/sources.md
  const handleSavePaginationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paginationValidation.valid || !paginationValidation.values) {
      setPaginationFeedback({
        type: 'error',
        message: paginationValidation.error || 'Wprowadź poprawne wartości paginacji.',
      });
      return;
    }

    setIsSavingPagination(true);
    setPaginationFeedback(null);

    try {
      const res = await fetch(`${cleanBase}/api/sources`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paginationSettings: paginationValidation.values,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nie udało się zapisać ustawień paginacji.');
      }

      const updatedSettings: PaginationSettings =
        data.paginationSettings || paginationValidation.values;
      setSavedPagination(updatedSettings);
      setHomePageSizeInput(String(updatedSettings.homePageSize));
      setArchivePageSizeInput(String(updatedSettings.archivePageSize));
      setAdminArchivePageSizeInput(String(updatedSettings.adminArchivePageSize));

      // Zaktualizuj również domyślne wartości w localStorage, aby od razu odzwierciedlić zmianę
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.removeItem(PAGINATION_STORAGE_KEYS.ARCHIVE_PAGE_SIZE);
          window.localStorage.removeItem(PAGINATION_STORAGE_KEYS.ADMIN_ARCHIVE_PAGE_SIZE);
        } catch {
          // ignore
        }
      }

      setPaginationFeedback({
        type: 'success',
        message: `Zapisano ustawienia paginacji w config/sources.md (Strona Główna: ${updatedSettings.homePageSize}, Archiwum: ${updatedSettings.archivePageSize}, Panel Archive: ${updatedSettings.adminArchivePageSize}).`,
      });
      setToast({
        type: 'success',
        message: 'Pomyślnie zapisano ustawienia wyświetlania i paginacji w config/sources.md!',
      });
    } catch (err: any) {
      setPaginationFeedback({
        type: 'error',
        message: err?.message || 'Wystąpił błąd podczas zapisywania ustawień paginacji.',
      });
    } finally {
      setIsSavingPagination(false);
    }
  };

  const handleResetPaginationDefaults = () => {
    setHomePageSizeInput(String(DEFAULT_PAGINATION.homePageSize));
    setArchivePageSizeInput(String(DEFAULT_PAGINATION.archivePageSize));
    setAdminArchivePageSizeInput(String(DEFAULT_PAGINATION.adminArchivePageSize));
    setPaginationFeedback(null);
  };

  // Walidacja konfiguracji Workera AI w locie
  const balanceValidation = useMemo<{
    valid: boolean;
    error?: string;
    values?: BalanceSettings;
  }>(() => {
    const intSpecs: Array<{
      key: BalanceNumericKey;
      label: string;
      min: number;
      max: number;
    }> = [
      { key: 'maxArticlesPerRun', label: 'Liczba artykułów na przebieg', min: 1, max: 12 },
      { key: 'maxCandidates', label: 'Liczba kandydatów Gemini', min: 1, max: 25 },
      { key: 'ticketedMaxPerRun', label: 'Maks. biletowanych na przebieg', min: 0, max: 12 },
      { key: 'ticketedMaxPerDay', label: 'Dzienny limit biletowanych', min: 0, max: 20 },
      { key: 'ticketedMinPerDay', label: 'Dzienne minimum biletowanych', min: 0, max: 10 },
      { key: 'nosprMaxPerRun', label: 'Limit NOSPR na przebieg', min: 0, max: 5 },
      { key: 'nosprMaxPerDay', label: 'Dzienny limit NOSPR', min: 0, max: 10 },
      { key: 'otherVenueMaxPerDay', label: 'Dzienny limit pozostałych scen', min: 0, max: 10 },
      { key: 'lastTicketsBonusPerDay', label: 'Dzienny bonus „Ostatnie bilety”', min: 0, max: 5 },
      { key: 'poolMaxItemsPerTicketedSource', label: 'Limit pozycji z 1 źródła biletowanego', min: 1, max: 15 },
      { key: 'maxPromptItems', label: 'Maks. materiałów w prompcie Gemini', min: 20, max: 120 },
      { key: 'cycleCooldownDays', label: 'Okres karencji cykli (dni)', min: 0, max: 30 },
      { key: 'weeklySummaryHorizonDays', label: 'Horyzont „Tygodnia w kulturze” (dni)', min: 3, max: 30 },
    ];

    const parsedInts: Record<string, number> = {};
    for (const spec of intSpecs) {
      const rawStr = balanceInputs[spec.key];
      const num = /^-?\d+$/.test(rawStr.trim()) ? Number(rawStr.trim()) : NaN;
      if (!Number.isInteger(num) || num < spec.min || num > spec.max) {
        return {
          valid: false,
          error: `${spec.label} musi być liczbą całkowitą z przedziału ${spec.min}–${spec.max}.`,
        };
      }
      parsedInts[spec.key] = num;
    }

    const ticketedPct = /^-?\d+$/.test(balanceInputs.ticketedMaxShare3d.trim())
      ? Number(balanceInputs.ticketedMaxShare3d.trim())
      : NaN;
    if (!Number.isInteger(ticketedPct) || ticketedPct < 0 || ticketedPct > 100) {
      return {
        valid: false,
        error: 'Maksymalny udział instytucji biletowanych (3 dni) musi wynosić od 0% do 100%.',
      };
    }

    const rssPct = /^-?\d+$/.test(balanceInputs.rssPoolShare.trim())
      ? Number(balanceInputs.rssPoolShare.trim())
      : NaN;
    if (!Number.isInteger(rssPct) || rssPct < 10 || rssPct > 90) {
      return {
        valid: false,
        error: 'Proporcja źródeł RSS w puli wejściowej musi wynosić od 10% do 90%.',
      };
    }

    if (parsedInts.maxCandidates < parsedInts.maxArticlesPerRun) {
      return {
        valid: false,
        error: `Liczba kandydatów Gemini (${parsedInts.maxCandidates}) musi być ≥ liczbie publikowanych artykułów (${parsedInts.maxArticlesPerRun}).`,
      };
    }
    if (parsedInts.ticketedMinPerDay > parsedInts.ticketedMaxPerDay) {
      return {
        valid: false,
        error: `Dzienne minimum biletowanych (${parsedInts.ticketedMinPerDay}) nie może przekraczać limitu dziennego (${parsedInts.ticketedMaxPerDay}).`,
      };
    }
    if (parsedInts.nosprMaxPerRun > parsedInts.ticketedMaxPerRun) {
      return {
        valid: false,
        error: `Limit NOSPR na przebieg (${parsedInts.nosprMaxPerRun}) nie może przekraczać limitu biletowanych na przebieg (${parsedInts.ticketedMaxPerRun}).`,
      };
    }
    if (parsedInts.nosprMaxPerDay > parsedInts.ticketedMaxPerDay) {
      return {
        valid: false,
        error: `Dzienny limit NOSPR (${parsedInts.nosprMaxPerDay}) nie może przekraczać dziennego limitu biletowanych (${parsedInts.ticketedMaxPerDay}).`,
      };
    }

    return {
      valid: true,
      values: {
        maxArticlesPerRun: parsedInts.maxArticlesPerRun,
        maxCandidates: parsedInts.maxCandidates,
        ticketedMaxShare3d: Math.round(ticketedPct) / 100,
        rssPoolShare: Math.round(rssPct) / 100,
        ticketedMaxPerRun: parsedInts.ticketedMaxPerRun,
        ticketedMaxPerDay: parsedInts.ticketedMaxPerDay,
        ticketedMinPerDay: parsedInts.ticketedMinPerDay,
        nosprMaxPerRun: parsedInts.nosprMaxPerRun,
        nosprMaxPerDay: parsedInts.nosprMaxPerDay,
        otherVenueMaxPerDay: parsedInts.otherVenueMaxPerDay,
        lastTicketsBonusPerDay: parsedInts.lastTicketsBonusPerDay,
        poolMaxItemsPerTicketedSource: parsedInts.poolMaxItemsPerTicketedSource,
        maxPromptItems: parsedInts.maxPromptItems,
        cycleCooldownDays: parsedInts.cycleCooldownDays,
        weeklySummaryEnabled: balanceInputs.weeklySummaryEnabled,
        weeklySummaryHorizonDays: parsedInts.weeklySummaryHorizonDays,
      },
    };
  }, [balanceInputs]);

  const updateBalanceField = (key: BalanceNumericKey, value: string) => {
    setBalanceInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveBalanceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceValidation.valid || !balanceValidation.values) {
      setBalanceFeedback({
        type: 'error',
        message: balanceValidation.error || 'Popraw nieprawidłowe wartości konfiguracji Workera AI.',
      });
      return;
    }

    setIsSavingBalance(true);
    setBalanceFeedback(null);

    try {
      const res = await fetch(`${cleanBase}/api/sources`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balanceSettings: balanceValidation.values,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nie udało się zapisać konfiguracji Workera AI.');
      }

      const updated: BalanceSettings = data.balanceSettings || balanceValidation.values;
      setSavedBalanceSettings(updated);
      setBalanceInputs(balanceToInputs(updated));

      const persistLabel =
        data.persisted === 'github'
          ? 'zapisano przez GitHub API (commit do main)'
          : data.persisted === 'client'
          ? 'tryb podglądu (brak zapisu na dysk/GitHub)'
          : 'zapisano lokalnie na dysku (fs)';

      setBalanceFeedback({
        type: 'success',
        message: `Zapisano konfigurację Workera AI w config/sources.md (${persistLabel}).`,
      });
      setToast({
        type: 'success',
        message: `Zapisano konfigurację Workera AI (${persistLabel})!`,
      });
    } catch (err: any) {
      setBalanceFeedback({
        type: 'error',
        message: err?.message || 'Wystąpił błąd podczas zapisywania konfiguracji Workera AI.',
      });
    } finally {
      setIsSavingBalance(false);
    }
  };

  const handleResetBalanceDefaults = () => {
    setBalanceInputs(balanceToInputs(DEFAULT_BALANCE_SETTINGS));
    setBalanceFeedback(null);
  };

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
      if (data.paginationSettings) {
        setSavedPagination(data.paginationSettings);
        setHomePageSizeInput(String(data.paginationSettings.homePageSize));
        setArchivePageSizeInput(String(data.paginationSettings.archivePageSize));
        setAdminArchivePageSizeInput(String(data.paginationSettings.adminArchivePageSize));
      }
      if (data.balanceSettings) {
        setSavedBalanceSettings(data.balanceSettings);
        setBalanceInputs(balanceToInputs(data.balanceSettings));
      }
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
          prev.map((s) =>
            s.id === editingId
              ? data.source || {
                  ...s,
                  name: formName.trim(),
                  type: formType,
                  url: formUrl.trim(),
                  category: formCategory.trim(),
                  hints: formHints.trim(),
                  status: formStatus,
                }
              : s
          )
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

  const homeNum = parseInt(homePageSizeInput, 10);
  const archiveNum = parseInt(archivePageSizeInput, 10);
  const isHomeMultipleOf6 = Number.isInteger(homeNum) && homeNum > 0 && homeNum % 6 === 0;
  const isArchiveMultipleOf6 = Number.isInteger(archiveNum) && archiveNum > 0 && archiveNum % 6 === 0;

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
            Przeglądaj, filtruj i edytuj listę źródeł wydarzeń oraz parametry wyświetlania. Każda zmiana jest bezpośrednio zapisywana do pliku{' '}
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

      {/* Sekcja: Ustawienia wyświetlania i paginacji */}
      <section
        aria-labelledby="pagination-settings-heading"
        className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 mt-0.5">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 id="pagination-settings-heading" className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Ustawienia wyświetlania i paginacji</span>
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-amber-300 border border-zinc-700">
                  config/sources.md
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Skonfiguruj domyślną liczbę artykułów wyświetlanych na jednej stronie dla Strony Głównej, Archiwum oraz Panelu Archive. Dla siatek kafelkowych rekomendowane są wielokrotności liczby <strong className="text-zinc-200">6</strong> (<code className="text-amber-300">6, 12, 18, 24, 36</code>), aby zachować pełne rzędy w układzie 2- i 3-kolumnowym.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetPaginationDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 transition cursor-pointer shrink-0 self-start md:self-center"
            title="Przywróć domyślne wartości (12 / 24 / 25)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Domyślne (12 / 24 / 25)</span>
          </button>
        </div>

        <form onSubmit={handleSavePaginationSettings} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. homePageSize */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="homePageSizeInput" className="text-xs font-bold text-zinc-200">
                    Strona Główna (<code className="text-amber-400 font-mono">homePageSize</code>)
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">domyślnie: 12</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-3">
                  Liczba kart artykułów na stronę w głównym feedzie aktualności.
                </p>

                <input
                  id="homePageSizeInput"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={homePageSizeInput}
                  onChange={(e) => setHomePageSizeInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-sm font-bold text-zinc-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Rekomendowane (×6):</span>
                  {isHomeMultipleOf6 ? (
                    <span className="text-emerald-400 font-medium">✓ Pełne rzędy (2 i 3 kol.)</span>
                  ) : (
                    <span className="text-amber-400 font-medium">Zalecana wielokrotność 6</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GRID_RECOMMENDED_MULTIPLES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setHomePageSizeInput(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        homeNum === preset
                          ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. archivePageSize */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="archivePageSizeInput" className="text-xs font-bold text-zinc-200">
                    Archiwum (<code className="text-amber-400 font-mono">archivePageSize</code>)
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">domyślnie: 24</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-3">
                  Domyślny limit kart w siatce widoku publicznego Archiwum.
                </p>

                <input
                  id="archivePageSizeInput"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={archivePageSizeInput}
                  onChange={(e) => setArchivePageSizeInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-sm font-bold text-zinc-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Rekomendowane (×6):</span>
                  {isArchiveMultipleOf6 ? (
                    <span className="text-emerald-400 font-medium">✓ Pełne rzędy (2 i 3 kol.)</span>
                  ) : (
                    <span className="text-amber-400 font-medium">Zalecana wielokrotność 6</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GRID_RECOMMENDED_MULTIPLES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setArchivePageSizeInput(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        archiveNum === preset
                          ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. adminArchivePageSize */}
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="adminArchivePageSizeInput" className="text-xs font-bold text-zinc-200">
                    Panel Archive (<code className="text-amber-400 font-mono">adminArchivePageSize</code>)
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">domyślnie: 25</span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-3">
                  Domyślna liczba wierszy tabeli w administracyjnym Panelu Archive.
                </p>

                <input
                  id="adminArchivePageSizeInput"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={adminArchivePageSizeInput}
                  onChange={(e) => setAdminArchivePageSizeInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-sm font-bold text-zinc-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Szybki wybór dla tabeli:</span>
                  <span className="text-zinc-500 font-mono">aktualnie zapisane: {savedPagination.adminArchivePageSize}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ADMIN_ARCHIVE_PAGE_SIZE_OPTIONS.map((preset) => {
                    const admNum = parseInt(adminArchivePageSizeInput, 10);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAdminArchivePageSizeInput(String(preset))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          admNum === preset
                            ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Komunikaty walidacji lub zapisu */}
          {!paginationValidation.valid && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{paginationValidation.error}</span>
            </div>
          )}

          {paginationFeedback && (
            <div
              className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs ${
                paginationFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {paginationFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{paginationFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setPaginationFeedback(null)}
                className="text-zinc-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Aktualnie w pliku:{' '}
                <strong className="text-zinc-200 font-mono">
                  homePageSize={savedPagination.homePageSize}, archivePageSize={savedPagination.archivePageSize}, adminArchivePageSize={savedPagination.adminArchivePageSize}
                </strong>
              </span>
            </div>

            <button
              type="submit"
              disabled={!paginationValidation.valid || isSavingPagination}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md shadow-amber-400/15 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
            >
              {isSavingPagination ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Zapisywanie do config/sources.md...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Zapisz ustawienia paginacji</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Sekcja: Konfiguracja Workera AI i Proporcji Treści */}
      {(() => {
        const articlesPerRunNum = parseInt(balanceInputs.maxArticlesPerRun, 10);
        const safeArticlesPerRun = Number.isInteger(articlesPerRunNum) ? articlesPerRunNum : 4;
        const ticketedSharePct = Math.max(
          0,
          Math.min(100, parseInt(balanceInputs.ticketedMaxShare3d, 10) || 0)
        );
        const otherSharePct = 100 - ticketedSharePct;
        const rssPoolPct = Math.max(
          10,
          Math.min(90, parseInt(balanceInputs.rssPoolShare, 10) || 50)
        );
        const webPoolPct = 100 - rssPoolPct;

        return (
          <section
            aria-labelledby="ai-worker-settings-heading"
            className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 mt-0.5">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="ai-worker-settings-heading"
                    className="text-base sm:text-lg font-bold text-zinc-100 flex flex-wrap items-center gap-2"
                  >
                    <span>Konfiguracja Workera AI i Proporcji Treści</span>
                    <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-amber-300 border border-zinc-700">
                      config/sources.md
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Steruj liczbą artykułów generowanych podczas jednego przebiegu Agenta AI oraz równowagą pomiędzy kulturą biletowaną (NOSPR, Teatry, Spodek) a aktualnościami miejskimi z portali RSS i stron WEB.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetBalanceDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 transition cursor-pointer shrink-0 self-start md:self-center"
                title="Przywróć domyślne parametry Workera AI"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Przywróć domyślne</span>
              </button>
            </div>

            <form onSubmit={handleSaveBalanceSettings} className="space-y-6">
              {/* Blok 1: Ilość artykułów na przebieg workera */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Blok 1 — Ilość artykułów na przebieg workera</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="maxArticlesPerRunInput" className="text-xs font-bold text-zinc-200">
                        Artykułów na przebieg (<code className="text-amber-400 font-mono">maxArticlesPerRun</code>)
                      </label>
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        maks. {Math.max(1, safeArticlesPerRun) * 4} / dobę (4 cykle)
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Docelowa maksymalna liczba nowych artykułów publikowanych w jednym uruchomieniu (zakres 1–12).
                    </p>
                    <input
                      id="maxArticlesPerRunInput"
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={balanceInputs.maxArticlesPerRun}
                      onChange={(e) => updateBalanceField('maxArticlesPerRun', e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-sm font-bold text-zinc-100 focus:outline-none transition"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-zinc-500 mr-1">Szybki wybór:</span>
                      {[2, 3, 4, 5, 6].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateBalanceField('maxArticlesPerRun', String(preset))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                            safeArticlesPerRun === preset
                              ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                              : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="maxCandidatesInput" className="text-xs font-bold text-zinc-200">
                        Kandydatów z Gemini (<code className="text-amber-400 font-mono">maxCandidates</code>)
                      </label>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        zalecane: {Math.max(1, safeArticlesPerRun) + 3}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Liczba propozycji w rankingu modelu przed deduplikacją i filtrami równowagi (musi być ≥ <code className="text-zinc-300">maxArticlesPerRun</code>).
                    </p>
                    <input
                      id="maxCandidatesInput"
                      type="number"
                      min={1}
                      max={25}
                      step={1}
                      value={balanceInputs.maxCandidates}
                      onChange={(e) => updateBalanceField('maxCandidates', e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl px-3.5 py-2 text-sm font-bold text-zinc-100 focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* Blok 2: Proporcje typów artykułów */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  <span>Blok 2 — Proporcje typów artykułów i limity kwotowe</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Suwak 1: ticketedMaxShare3d */}
                  <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="ticketedMaxShare3dSlider" className="text-xs font-bold text-zinc-200">
                        Maks. udział biletowanych w 3 dni (<code className="text-amber-400 font-mono">ticketedMaxShare3d</code>)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          aria-label="Procent biletowanych w 3 dni"
                          value={balanceInputs.ticketedMaxShare3d}
                          onChange={(e) => updateBalanceField('ticketedMaxShare3d', e.target.value)}
                          className="w-16 bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-lg px-2 py-1 text-xs font-bold text-amber-300 text-right focus:outline-none"
                        />
                        <span className="text-xs font-bold text-zinc-400">%</span>
                      </div>
                    </div>

                    <input
                      id="ticketedMaxShare3dSlider"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={ticketedSharePct}
                      onChange={(e) => updateBalanceField('ticketedMaxShare3d', e.target.value)}
                      className="w-full accent-amber-400 cursor-pointer"
                    />

                    {/* Pasek podziału wizualnego */}
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full rounded-full overflow-hidden bg-zinc-800 flex">
                        <div
                          className="bg-amber-400 transition-all duration-200"
                          style={{ width: `${ticketedSharePct}%` }}
                        />
                        <div
                          className="bg-sky-500 transition-all duration-200"
                          style={{ width: `${otherSharePct}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-amber-300 font-semibold">
                          {ticketedSharePct}% Instytucje biletowane (NOSPR, Teatry, Spodek)
                        </span>
                        <span className="text-sky-300 font-semibold">
                          {otherSharePct}% Życie miasta, dzieci, drogi, sport, alerty
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Suwak 2: rssPoolShare */}
                  <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="rssPoolShareSlider" className="text-xs font-bold text-zinc-200">
                        Proporcja puli wejściowej RSS vs WEB (<code className="text-amber-400 font-mono">rssPoolShare</code>)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={10}
                          max={90}
                          step={5}
                          aria-label="Procent źródeł RSS w puli"
                          value={balanceInputs.rssPoolShare}
                          onChange={(e) => updateBalanceField('rssPoolShare', e.target.value)}
                          className="w-16 bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-lg px-2 py-1 text-xs font-bold text-amber-300 text-right focus:outline-none"
                        />
                        <span className="text-xs font-bold text-zinc-400">%</span>
                      </div>
                    </div>

                    <input
                      id="rssPoolShareSlider"
                      type="range"
                      min={10}
                      max={90}
                      step={5}
                      value={rssPoolPct}
                      onChange={(e) => updateBalanceField('rssPoolShare', e.target.value)}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />

                    {/* Pasek podziału wizualnego */}
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full rounded-full overflow-hidden bg-zinc-800 flex">
                        <div
                          className="bg-emerald-400 transition-all duration-200"
                          style={{ width: `${rssPoolPct}%` }}
                        />
                        <div
                          className="bg-purple-500 transition-all duration-200"
                          style={{ width: `${webPoolPct}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-emerald-300 font-semibold">
                          {rssPoolPct}% Portale lokalne RSS
                        </span>
                        <span className="text-purple-300 font-semibold">
                          {webPoolPct}% Strony instytucji i repertuary WEB
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pola limitów kwotowych */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {(
                    [
                      { key: 'ticketedMaxPerRun', label: 'Bilet. / bieg', min: 0, max: 12 },
                      { key: 'ticketedMaxPerDay', label: 'Bilet. / dzień', min: 0, max: 20 },
                      { key: 'ticketedMinPerDay', label: 'Min. bilet. / dzień', min: 0, max: 10 },
                      { key: 'nosprMaxPerRun', label: 'NOSPR / bieg', min: 0, max: 5 },
                      { key: 'nosprMaxPerDay', label: 'NOSPR / dzień', min: 0, max: 10 },
                      { key: 'otherVenueMaxPerDay', label: 'Inna scena / dzień', min: 0, max: 10 },
                      { key: 'lastTicketsBonusPerDay', label: 'Bonus pilne / dzień', min: 0, max: 5 },
                    ] as const
                  ).map((field) => (
                    <label
                      key={field.key}
                      className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-1.5 block"
                    >
                      <span className="block text-[11px] font-semibold text-zinc-300 truncate" title={field.key}>
                        {field.label}
                      </span>
                      <span className="block text-[10px] font-mono text-zinc-500 truncate">
                        {field.key}
                      </span>
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={1}
                        value={balanceInputs[field.key]}
                        onChange={(e) => updateBalanceField(field.key, e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-sm font-bold text-zinc-100 focus:outline-none transition"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Blok 3: Zwijana sekcja zaawansowana i Tydzień w kulturze */}
              <div className="border border-zinc-800/80 rounded-xl bg-zinc-950/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsAdvancedBalanceOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-bold text-zinc-200 hover:bg-zinc-900/60 transition cursor-pointer"
                >
                  <span>Parametry zaawansowane i „Tydzień w kulturze”</span>
                  {isAdvancedBalanceOpen ? (
                    <ChevronUp className="w-4 h-4 text-amber-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                  )}
                </button>

                {isAdvancedBalanceOpen && (
                  <div className="p-4 pt-2 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between">
                      <div>
                        <span className="block text-xs font-bold text-zinc-200">
                          Tydzień w kulturze
                        </span>
                        <span className="block text-[10px] font-mono text-zinc-500 mb-2">
                          weeklySummaryEnabled
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={balanceInputs.weeklySummaryEnabled}
                          onChange={(e) =>
                            setBalanceInputs((prev) => ({
                              ...prev,
                              weeklySummaryEnabled: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-zinc-300">
                          {balanceInputs.weeklySummaryEnabled ? 'Włączone' : 'Wyłączone'}
                        </span>
                      </label>
                    </div>

                    {(
                      [
                        {
                          key: 'weeklySummaryHorizonDays',
                          label: 'Horyzont (dni)',
                          min: 3,
                          max: 30,
                        },
                        {
                          key: 'cycleCooldownDays',
                          label: 'Karencja cykli (dni)',
                          min: 0,
                          max: 30,
                        },
                        {
                          key: 'poolMaxItemsPerTicketedSource',
                          label: 'Poz. / źródło bilet.',
                          min: 1,
                          max: 15,
                        },
                        {
                          key: 'maxPromptItems',
                          label: 'Maks. poz. w prompcie',
                          min: 20,
                          max: 120,
                        },
                      ] as const
                    ).map((field) => (
                      <label
                        key={field.key}
                        className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 space-y-1.5 block"
                      >
                        <span className="block text-xs font-bold text-zinc-200">
                          {field.label}
                        </span>
                        <span className="block text-[10px] font-mono text-zinc-500 truncate">
                          {field.key}
                        </span>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={1}
                          value={balanceInputs[field.key]}
                          onChange={(e) => updateBalanceField(field.key, e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-sm font-bold text-zinc-100 focus:outline-none transition"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {!balanceValidation.valid && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{balanceValidation.error}</span>
                </div>
              )}

              {balanceFeedback && (
                <div
                  className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs ${
                    balanceFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {balanceFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{balanceFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBalanceFeedback(null)}
                    className="text-zinc-400 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                  <Bot className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Zapisane w pliku:{' '}
                    <strong className="text-zinc-200 font-mono">
                      maxArticlesPerRun={savedBalanceSettings.maxArticlesPerRun}, ticketedMaxShare3d=
                      {savedBalanceSettings.ticketedMaxShare3d.toFixed(2)}, rssPoolShare=
                      {savedBalanceSettings.rssPoolShare.toFixed(2)}, maxPromptItems=
                      {savedBalanceSettings.maxPromptItems}
                    </strong>
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!balanceValidation.valid || isSavingBalance}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md shadow-amber-400/15 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                >
                  {isSavingBalance ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Zapisywanie konfiguracji AI...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Zapisz konfigurację Workera AI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        );
      })()}

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
            {(stats.active > 0 || statusFilter === 'ACTIVE') && (
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
            )}
            {(stats.inactive > 0 || statusFilter === 'INACTIVE') && (
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
            )}
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
            {(stats.rss > 0 || typeFilter === 'RSS') && (
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
            )}
            {(stats.web > 0 || typeFilter === 'WEB') && (
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
            )}
            {(stats.dynamicWeb > 0 || typeFilter === 'DYNAMIC_WEB') && (
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
            )}
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
