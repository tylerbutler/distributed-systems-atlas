import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  compressHTML: false,
  prerenderConflictBehavior: "error",
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
