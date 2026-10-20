/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      padding: {
        safe: 'env(safe-area-inset-bottom)',
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
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
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
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        // Softer, brand-tinted elevation scale (dark green instead of flat
        // black) — this replaces Tailwind's default shadow-sm/md/lg/xl/2xl
        // everywhere they're already used in the app, so cards, headers,
        // modals and buttons all pick up a more premium, diffused look
        // without touching every component file.
        xs: "0 1px 2px 0 rgb(15 46 34 / 0.05)",
        sm: "0 1px 2px -1px rgb(15 46 34 / 0.06), 0 2px 4px -1px rgb(15 46 34 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(15 46 34 / 0.07), 0 1px 2px -1px rgb(15 46 34 / 0.05)",
        md: "0 4px 10px -2px rgb(15 46 34 / 0.08), 0 2px 6px -2px rgb(15 46 34 / 0.05)",
        lg: "0 12px 24px -8px rgb(15 46 34 / 0.12), 0 4px 10px -4px rgb(15 46 34 / 0.06)",
        xl: "0 24px 48px -12px rgb(15 46 34 / 0.16), 0 8px 16px -8px rgb(15 46 34 / 0.08)",
        "2xl": "0 32px 64px -16px rgb(15 46 34 / 0.22), 0 12px 24px -8px rgb(15 46 34 / 0.1)",
        glow: "0 0 0 1px rgb(201 168 76 / 0.35), 0 8px 24px -8px rgb(201 168 76 / 0.35)",
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
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        // Появление чат-виджета: панель выезжает снизу, подсказка проявляется.
        // Объявлены здесь, а не строкой animate-[...] в разметке: произвольное имя
        // без keyframes Tailwind молча пропускает, и анимации просто нет.
        "chat-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "chat-teaser": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        // Пульсация трубки в анимации «Соединяем с оператором» (ChatWidget.tsx,
        // ConnectingAnimation) — расходящееся кольцо, как у входящего звонка.
        callring: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(5,150,105,0.45)" },
          "50%": { boxShadow: "0 0 0 10px rgba(5,150,105,0)" },
        },
        // Та же пульсация, но белым кольцом — иконка звонка лежит на зелёной
        // шапке чата (ChatWidget.tsx), и зелёное на зелёном было бы не видно.
        ringwhite: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,255,255,0.55)" },
          "50%": { boxShadow: "0 0 0 8px rgba(255,255,255,0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        callring: "callring 1.4s ease-out infinite",
        // Внимание к иконке звонка в шапке — ровно два удара, не бесконечно
        // (владелец 23.08.2026: «пульсирует один-два раза, чтобы внимание взять
        // и всё» — не мигающая на весь визит лампочка).
        "ring-attention": "ringwhite 1.1s ease-out 2",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "chat-in": "chat-in 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)",
        "chat-teaser": "chat-teaser 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
