import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react';

interface AdminLoginFormProps {
  nextUrl: string;
  isConfigured: boolean;
  baseUrl?: string;
}

export default function AdminLoginForm({
  nextUrl,
  isConfigured,
  baseUrl = '/',
}: AdminLoginFormProps) {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Podaj hasło administratora.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${cleanBase}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Nie udało się zalogować.');
        return;
      }

      window.location.assign(nextUrl || `${cleanBase}/admin/sources`);
    } catch {
      setErrorMsg('Błąd połączenia z serwerem podczas logowania.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight">
            Panel Administratora
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Dostęp do konfiguracji źródeł, ustawień Workera AI oraz zarządzania archiwum wymaga podania sekretu administratora.
          </p>
        </div>

        {!isConfigured && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-rose-200 mb-0.5">
                Brak konfiguracji ADMIN_SECRET
              </strong>
              <span>
                Ustaw zmienną środowiskową <code className="font-mono text-rose-200">ADMIN_SECRET</code> w pliku{' '}
                <code className="font-mono text-rose-200">.env</code> (lokalnie) lub w ustawieniach Vercel, aby włączyć logowanie.
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="block text-xs font-semibold text-zinc-300">
              Hasło administratora (<code className="text-amber-400 font-mono">ADMIN_SECRET</code>)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                disabled={!isConfigured || isSubmitting}
                placeholder="Wpisz hasło administratora..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-xl pl-10 pr-11 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isConfigured || isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-lg shadow-amber-400/15 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{isSubmitting ? 'Weryfikacja sesji...' : 'Zaloguj do panelu'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs">
          <a
            href={baseUrl || '/'}
            className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Wróć na portal</span>
          </a>
          <span className="text-zinc-500 font-mono text-[11px]">HMAC-SHA256 · HttpOnly</span>
        </div>
      </div>
    </div>
  );
}
