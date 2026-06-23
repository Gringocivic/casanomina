/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FDF8F3",
        terracotta: {
          50:  "#fdf2ee",
          100: "#fae2d9",
          200: "#f4c3ae",
          300: "#eb9e7d",
          400: "#e07249",
          500: "#C4572A",
          600: "#b04422",
          700: "#923520",
          800: "#772c22",
          900: "#622721",
        },
        sage: {
          50:  "#f2f7f2",
          100: "#e0ede1",
          200: "#c3dac5",
          300: "#9bc19f",
          400: "#6ea175",
          500: "#5A7A5F",
          600: "#456050",
          700: "#3a4f43",
          800: "#313f38",
          900: "#2a342f",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
