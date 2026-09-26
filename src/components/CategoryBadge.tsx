import React from 'react';
import { CATEGORIES } from '../lib/constants';
import { Sparkles, Car, Palette, Utensils, Activity, AlertTriangle, Tag } from 'lucide-react';

interface CategoryBadgeProps {
  category: string;
}

const ICONS_MAP: Record<string, React.ReactNode> = {
  wydarzenia: <Sparkles className="w-3.5 h-3.5" />,
  'drogi-komunikacja': <Car className="w-3.5 h-3.5" />,
  kultura: <Palette className="w-3.5 h-3.5" />,
  gastro: <Utensils className="w-3.5 h-3.5" />,
  sport: <Activity className="w-3.5 h-3.5" />,
  alerty: <AlertTriangle className="w-3.5 h-3.5" />,
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const info = CATEGORIES[category] || {
    name: category,
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };

  const icon = ICONS_MAP[category] || <Tag className="w-3.5 h-3.5" />;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${info.badgeClass}`}
    >
      {icon}
      {info.name}
    </span>
  );
};
