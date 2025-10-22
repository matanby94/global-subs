/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6a1b9a', // Darker purple for better contrast
        secondary: '#4a148c', // Even darker for hover states
        accent: '#8e24aa',
      },
    },
  },
  plugins: [],
};
