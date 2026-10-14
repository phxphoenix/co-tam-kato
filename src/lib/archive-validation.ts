export interface ValidationResult {
  valid: boolean;
  error?: string;
  value?: number;
}

/**
 * Waliduje wartość okresu archiwizacji:
 * - Wymagana (niepusta)
 * - Liczba całkowita (integer)
 * - Dodatnia (min: 1)
 * - Maksymalnie 365 dni
 */
export function validateArchivePeriod(rawVal: unknown): ValidationResult {
  if (rawVal === undefined || rawVal === null || (typeof rawVal === 'string' && rawVal.trim() === '')) {
    return {
      valid: false,
      error: 'Pole okresu archiwizacji nie może być puste. Wprowadź liczbę dni od 1 do 365.',
    };
  }

  const num = typeof rawVal === 'number' ? rawVal : Number(String(rawVal).trim());

  if (isNaN(num) || !Number.isFinite(num)) {
    return {
      valid: false,
      error: 'Wprowadzona wartość musi być poprawną liczbą całkowitą.',
    };
  }

  if (!Number.isInteger(num)) {
    return {
      valid: false,
      error: 'Okres archiwizacji musi być liczbą całkowitą (bez ułamków dziesiętnych).',
    };
  }

  if (num < 1) {
    return {
      valid: false,
      error: 'Okres archiwizacji musi być liczbą całkowitą dodatnią (minimum 1 dzień).',
    };
  }

  if (num > 365) {
    return {
      valid: false,
      error: 'Okres archiwizacji nie może przekraczać 365 dni.',
    };
  }

  return {
    valid: true,
    value: num,
  };
}
