import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#eef3f7",
        line: "#d9e2ea",
        focus: "#0f766e",
        signal: "#b45309"
      },
      boxShadow: {
        subtle: "0 8px 24px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
