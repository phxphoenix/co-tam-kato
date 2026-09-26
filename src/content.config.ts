import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    city: z.enum([
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
    ]),
    category: z.enum([
      'wydarzenia',
      'drogi-komunikacja',
      'kultura',
      'gastro',
      'sport',
      'alerty',
    ]),
    status: z.enum(['published', 'draft']).default('published'),
    summary: z.string(),
    location: z.string().optional(),
    isAlert: z.boolean().default(false),
    sourceUrl: z.string().optional(),
    aiGenerated: z.boolean().default(false),
  }),
});

export const collections = { news };
