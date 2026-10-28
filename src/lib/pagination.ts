export const ARCHIVE_PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
export const ADMIN_ARCHIVE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const GRID_RECOMMENDED_MULTIPLES = [6, 12, 18, 24, 36] as const;

export const PAGINATION_STORAGE_KEYS = {
  ARCHIVE_PAGE_SIZE: 'cotamkato_archive_page_size',
  ADMIN_ARCHIVE_PAGE_SIZE: 'cotamkato_admin_archive_page_size',
} as const;

export type PageToken = number | 'ellipsis';

/**
 * Generates smart page tokens with ellipsis (e.g., [1, 'ellipsis', 4, 5, 6, 'ellipsis', 20])
 * so pagination never overflows on mobile or desktop viewports.
 */
export function getPaginationPages(currentPage: number, totalPages: number): PageToken[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.max(1, Math.min(Math.floor(currentPage), total));

  if (total <= 7) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', total];
  }

  if (current >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

/**
 * Computes pagination metadata, safe current page, slice bounds, and Polish counter text.
 */
export function getPaginationMeta(currentPage: number, pageSize: number, totalItems: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 12);
  const safeTotalItems = Math.max(0, Math.floor(totalItems) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));
  const safeCurrentPage = Math.max(1, Math.min(Math.floor(currentPage) || 1, totalPages));

  const startIndex = safeTotalItems === 0 ? 0 : (safeCurrentPage - 1) * safePageSize;
  const endIndex = safeTotalItems === 0 ? 0 : Math.min(startIndex + safePageSize, safeTotalItems);

  const startItem = safeTotalItems === 0 ? 0 : startIndex + 1;
  const endItem = endIndex;

  const counterText = `Wyświetlanie ${startItem}–${endItem} z ${safeTotalItems} artykułów`;

  return {
    safeCurrentPage,
    pageSize: safePageSize,
    totalItems: safeTotalItems,
    totalPages,
    startIndex,
    endIndex,
    startItem,
    endItem,
    counterText,
  };
}

/**
 * Builds the sorted list of page size options, ensuring the configured default is included.
 */
export function buildPageSizeOptions(baseOptions: readonly number[], configuredDefault: number): number[] {
  const set = new Set<number>(baseOptions);
  if (Number.isInteger(configuredDefault) && configuredDefault > 0) {
    set.add(configuredDefault);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Reads user-selected page size from localStorage with fallback to config/sources.md value.
 */
export function readStoredPageSize(storageKey: string, fallback: number): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 500) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Saves user-selected page size to localStorage.
 */
export function writeStoredPageSize(storageKey: string, value: number): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}
