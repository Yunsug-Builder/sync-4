import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        "sync-purple": "#8B5CF6",
        /** System canvas — matches Tailwind zinc-950 */
        background: "oklch(14.1% 0.005 285.823)",
      },
    },
  },
};

export default config;
