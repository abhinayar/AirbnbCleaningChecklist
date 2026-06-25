import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF5A5F",
          dark: "#E0484D",
        },
      },
    },
  },
  plugins: [],
};

export default config;
