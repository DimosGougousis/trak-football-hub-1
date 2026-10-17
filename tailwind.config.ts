import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ['"DM Sans"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // TRAK-189: Trak's role colours (src/index.css --t-*), with /alpha.
        "ground": "rgb(var(--t-ground) / <alpha-value>)",
        "surface": "rgb(var(--t-surface) / <alpha-value>)",
        "raised": "rgb(var(--t-raised) / <alpha-value>)",
        "ink": "rgb(var(--t-ink) / <alpha-value>)",
        "ink-2": "rgb(var(--t-ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--t-ink-3) / <alpha-value>)",
        "line": "rgb(var(--t-line) / <alpha-value>)",
        "line-strong": "rgb(var(--t-line-strong) / <alpha-value>)",
        "brand": "rgb(var(--t-brand) / <alpha-value>)",
        "on-brand": "rgb(var(--t-on-brand) / <alpha-value>)",
        "on-bright": "rgb(var(--t-on-bright) / <alpha-value>)",
        "scrim": "rgb(var(--t-scrim) / <alpha-value>)",
        "danger": "rgb(var(--t-danger) / <alpha-value>)",
        "success": "rgb(var(--t-success) / <alpha-value>)",
        "info": "rgb(var(--t-info) / <alpha-value>)",
        "warning": "rgb(var(--t-warning) / <alpha-value>)",
        "accent-orange": "rgb(var(--t-orange) / <alpha-value>)",
        "coach-orange": "hsl(var(--coach-orange))",
        "training-blue": "hsl(var(--training-blue))",
        gold: "hsl(var(--gold))",
        red: "hsl(var(--red))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":       { transform: "translateX(-6px)" },
          "40%":       { transform: "translateX(6px)" },
          "60%":       { transform: "translateX(-4px)" },
          "80%":       { transform: "translateX(4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        shake: "shake 0.5s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
