import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const CITY_VALUES = [
  'katowice',
  'chorzow',
  'siemianowice',
  'sosnowiec',
  'myslowice',
  'ruda-slaska',
  'tychy',
  'czeladz',
  'bytom',
  'swietochlowice',
  'dabrowa-gornicza',
  'cala-okolica',
] as const;

export const CATEGORY_VALUES = [
  'dla-dzieci',
  'wydarzenia',
  'drogi-komunikacja',
  'kultura',
  'gastro',
  'sport',
  'alerty',
] as const;

export const STATUS_VALUES = ['published', 'draft', 'deleted'] as const;

export type NewsCity = (typeof CITY_VALUES)[number];
export type NewsCategory = (typeof CATEGORY_VALUES)[number];
export type NewsStatus = (typeof STATUS_VALUES)[number];

/**
 * Schemat walidacji Zod dla frontmattera artykułu.
 * Wymaga jawnego `publishedDate` oraz opcjonalnego `eventDate`.
 */
export const newsSchema = z.object({
  title: z.string(),
  /**
   * Data publikacji artykułu (w źródle lub data dodania na portal Co Tam KATO).
   * Pole wymagane używane do sortowania wpisów w feedzie oraz wyliczania wieku do archiwizacji.
   */
  publishedDate: z.coerce.date(),
  /**
   * Faktyczna data lub data rozpoczęcia wydarzenia (np. koncertu, spektaklu),
   * jeśli artykuł dotyczy konkretnego wydarzenia (opcjonalne / nullable).
   */
  eventDate: z.coerce.date().nullable().optional(),
  city: z.enum(CITY_VALUES),
  category: z.enum(CATEGORY_VALUES),
  status: z.enum(STATUS_VALUES).default('published'),
  summary: z.string(),
  location: z.string().optional(),
  isAlert: z.boolean().default(false),
  isForKids: z.boolean().default(false),
  ageRange: z.string().optional(), // np. "4-10 lat", "5-8 lat"
  sourceUrl: z.string().optional(),
  aiGenerated: z.boolean().default(false),
  archived: z.boolean().default(false),
  manualOverride: z.boolean().default(false),
});

export type NewsArticleInput = z.input<typeof newsSchema>;
export type NewsArticleData = z.output<typeof newsSchema>;

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: newsSchema,
});

export const collections = { news };
