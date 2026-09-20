import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const sheetReference = z.union([
  z.string(),
  z.object({
    id: z.string(),
    planned: z.literal(true),
  }),
]);

const sheet = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/sheets" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    territory: z.enum(["mechanisms", "structures", "failures", "systems"]),
    status: z.enum(["published", "planned"]),
    requires: z.array(sheetReference).default([]),
    introduces: z.array(z.string()).default([]),
    related: z.array(sheetReference).default([]),
    scenarios: z.array(z.string()).default([]),
    terms: z
      .array(z.object({ term: z.string(), definition: z.string() }))
      .default([]),
    references: z
      .array(
        z.object({
          key: z.string(),
          title: z.string(),
          url: z.string().url(),
        }),
      )
      .default([]),
  }),
});

export const collections = { sheet };
