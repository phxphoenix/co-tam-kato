export interface CityInfo {
  name: string;
  shortName: string;
  color: string;
  badgeClass: string;
}

export const CITIES: Record<string, CityInfo> = {
  katowice: {
    name: 'Katowice',
    shortName: 'KATO',
    color: '#f59e0b',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  chorzow: {
    name: 'Chorzów',
    shortName: 'CHORZÓW',
    color: '#38bdf8',
    badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  },
  siemianowice: {
    name: 'Siemianowice Śląskie',
    shortName: 'SIEMIANOWICE',
    color: '#34d399',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  sosnowiec: {
    name: 'Sosnowiec',
    shortName: 'SOSNOWIEC',
    color: '#f43f5e',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  myslowice: {
    name: 'Mysłowice',
    shortName: 'MYSŁOWICE',
    color: '#a855f7',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  'ruda-slaska': {
    name: 'Ruda Śląska',
    shortName: 'RUDA ŚL.',
    color: '#fb923c',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  },
  tychy: {
    name: 'Tychy',
    shortName: 'TYCHY',
    color: '#2dd4bf',
    badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  },
  czeladz: {
    name: 'Czeladź',
    shortName: 'CZELADŹ',
    color: '#ec4899',
    badgeClass: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  },
  bytom: {
    name: 'Bytom',
    shortName: 'BYTOM',
    color: '#6366f1',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  },
  swietochlowice: {
    name: 'Świętochłowice',
    shortName: 'ŚWIĘTOCHŁOWICE',
    color: '#84cc16',
    badgeClass: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
  },
  'dabrowa-gornicza': {
    name: 'Dąbrowa Górnicza',
    shortName: 'DĄBROWA',
    color: '#14b8a6',
    badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  },
  'cala-okolica': {
    name: 'Cała Aglomeracja / Śląsk',
    shortName: 'AGLOMERACJA',
    color: '#eab308',
    badgeClass: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  },
};

export interface CategoryInfo {
  name: string;
  iconName: string;
  badgeClass: string;
}

export const CATEGORIES: Record<string, CategoryInfo> = {
  'dla-dzieci': {
    name: 'Dla Dzieci (4-10 lat)',
    iconName: 'Smile',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  wydarzenia: {
    name: 'Wydarzenia & Imprezy',
    iconName: 'Sparkles',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  'drogi-komunikacja': {
    name: 'Drogi & Komunikacja',
    iconName: 'Car',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  kultura: {
    name: 'Kultura & Rozrywka',
    iconName: 'Palette',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  gastro: {
    name: 'Gastro & Miejscówki',
    iconName: 'Utensils',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  sport: {
    name: 'Sport & Rekreacja',
    iconName: 'Activity',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  alerty: {
    name: 'Ważne Alerty',
    iconName: 'AlertTriangle',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};
