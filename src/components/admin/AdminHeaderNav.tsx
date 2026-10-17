import React from 'react';
import { Database, Archive, Settings, ExternalLink } from 'lucide-react';

interface AdminHeaderNavProps {
  currentTab: 'sources' | 'archive';
  baseUrl?: string;
}

export default function AdminHeaderNav({ currentTab, baseUrl = '/' }: AdminHeaderNavProps) {
  const cleanBase = baseUrl.replace(/\/$/, '');

  const tabs = [
    {
      id: 'sources',
      label: 'Źródła wydarzeń',
      href: `${cleanBase}/admin/sources`,
      icon: Database,
      description: 'Zarządzanie config/sources.md',
    },
    {
      id: 'archive',
      label: 'Retencja i Archiwum',
      href: `${cleanBase}/admin/archive`,
      icon: Archive,
      description: 'Worker i czyszczenie',
    },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-8">
      {/* Zakładki */}
      <nav className="flex items-center gap-2 p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/20'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Skróty do CMS i strony */}
      <div className="flex items-center gap-2">
        <a
          href={`${cleanBase}/keystatic`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition"
        >
          <Settings className="w-3.5 h-3.5 text-zinc-400" />
          <span>Keystatic CMS</span>
        </a>
        <a
          href={cleanBase || '/'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition"
        >
          <span>Podgląd portalu</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
