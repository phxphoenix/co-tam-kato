import React, { useState, useRef, useEffect } from 'react';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  slug: string;
  title?: string;
  summary?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
  slug,
  title,
  summary,
  showLabel = false,
  size = 'md',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getShareUrl = () => {
    const rawBase = import.meta.env.BASE_URL || '/';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const relativePath = `${base}wpis/${slug}`;
    if (typeof window !== 'undefined') {
      return new URL(relativePath, window.location.origin).toString();
    }
    return relativePath;
  };

  const triggerCopiedState = () => {
    setCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2200);
  };

  const copyToClipboard = async (url: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        triggerCopiedState();
        return;
      }
    } catch {
      // Fallback poniżej jeśli Clipboard API rzuci wyjątek
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      triggerCopiedState();
    } catch {
      // Ignoruj w przypadku całkowitej blokady schowka
    }
  };

  const isMobileOrTouchDevice = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const uaMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return uaMobile || (coarsePointer && navigator.maxTouchPoints > 0);
  };

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const url = getShareUrl();

    // Na urządzeniach mobilnych używamy natywnego arkusza Web Share API
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && isMobileOrTouchDevice()) {
      try {
        await navigator.share({
          title: title ? `${title} | Co Tam KATO` : 'Co Tam KATO',
          text: summary || title || '',
          url,
        });
        return;
      } catch (err) {
        // Jeśli użytkownik sam zamknął arkusz udostępniania (AbortError), nic więcej nie robimy
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Przy innym błędzie przejdź do skopiowania linku do schowka
      }
    }

    // Na laptopach / komputerach stacjonarnych (lub jako fallback) od razu kopiujemy link (Opcja A)
    await copyToClipboard(url);
  };

  const label = copied ? 'Skopiowano link!' : 'Udostępnij';
  const ariaLabel = copied
    ? 'Skopiowano link do schowka'
    : `Udostępnij ${title ? `„${title}”` : 'artykuł'}`;

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer ${
          size === 'sm' ? 'px-3 py-1.5' : 'px-3.5 py-2'
        } ${
          copied
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/10'
            : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 hover:border-amber-400/60 hover:text-amber-400 hover:bg-zinc-800'
        } ${className}`}
      >
        {copied ? (
          <Check
            className={`transition-all duration-200 ${
              size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
            } text-emerald-400 scale-110`}
          />
        ) : (
          <Share2
            className={`transition-all duration-200 ${
              size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
            } text-zinc-400 group-hover:text-amber-400`}
          />
        )}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`rounded-full border transition-all duration-200 active:scale-90 focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer ${
        size === 'sm' ? 'p-1.5' : 'p-2'
      } ${
        copied
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-500/10 scale-105 ring-1 ring-emerald-400/30'
          : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-amber-400 hover:border-amber-400/50 hover:bg-zinc-800'
      } ${className}`}
    >
      {copied ? (
        <Check
          className={`transition-transform duration-200 ${
            size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'
          } text-emerald-400 scale-110`}
        />
      ) : (
        <Share2
          className={`transition-transform duration-200 ${
            size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'
          }`}
        />
      )}
    </button>
  );
};
