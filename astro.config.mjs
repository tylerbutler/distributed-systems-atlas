import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  compressHTML: false,
  prerenderConflictBehavior: "error",
  redirects: {
    "/structures/transforms": "/structures/",
  },
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
