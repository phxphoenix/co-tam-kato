import React from 'react';
import { CITIES } from '../lib/constants';

interface CityBadgeProps {
  city: string;
  size?: 'sm' | 'md';
}

export const CityBadge: React.FC<CityBadgeProps> = ({ city, size = 'md' }) => {
  const info = CITIES[city] || {
    name: city,
    shortName: city.toUpperCase(),
    badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  };

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5' 
    : 'text-xs font-semibold px-2.5 py-1 tracking-wide';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border uppercase ${sizeClasses} ${info.badgeClass}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {info.shortName}
    </span>
  );
};
