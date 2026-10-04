import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  compressHTML: false,
  prerenderConflictBehavior: "error",
  redirects: {
    "/structures/transforms": "/structures/",
    "/atlas/multi-device-g-counter/": "/atlas/multiplayer-rooms/",
  },
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
