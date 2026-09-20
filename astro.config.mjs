import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  prerenderConflictBehavior: "error",
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
