import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // BodyLytics brand
        navy: {
          DEFAULT: "#1B3A57",
          50: "#E8EDF2",
          100: "#D1DBE5",
          200: "#A3B7CB",
          300: "#7593B1",
          400: "#486F97",
          500: "#1B3A57",
          600: "#162F46",
          700: "#102335",
          800: "#0B1823",
          900: "#050C12",
        },
        teal: {
          DEFAULT: "#00BFA5",
          50: "#E0F7F4",
          100: "#B3EDE5",
          200: "#80E2D5",
          300: "#4DD7C5",
          400: "#26CFB9",
          500: "#00BFA5",
          600: "#00A890",
          700: "#00917B",
          800: "#007A66",
          900: "#005344",
        },
        copper: {
          DEFAULT: "#C77B4A",
          50: "#F9F0E9",
          100: "#F0D9C8",
          200: "#E5BDA0",
          300: "#DAA178",
          400: "#D18E5E",
          500: "#C77B4A",
          600: "#B06A3D",
          700: "#8E5531",
          800: "#6C4125",
          900: "#4A2C19",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        montserrat: ["Montserrat", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
