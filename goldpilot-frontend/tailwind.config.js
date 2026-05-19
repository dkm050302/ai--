/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色调
        bg: '#f4f7fa',
        paper: '#ffffff',
        ink: '#1d252d',
        muted: '#667482',
        line: '#dfe6ec',
        'line-dark': '#c8d2dc',
        // 功能色
        green: '#0f9f6e',
        'green-soft': '#eafaf3',
        red: '#e3342f',
        'red-soft': '#fff0f0',
        blue: '#1769e0',
        'blue-soft': '#edf5ff',
        amber: '#b97800',
        'amber-soft': '#fff8e6',
        // 新增柔和色调
        'soft-blue': '#e8f0fe',
        'soft-indigo': '#eef2ff',
        'soft-purple': '#f5f3ff',
        'gradient-start': '#f8fafc',
        'gradient-mid': '#f1f5f9',
        'gradient-end': '#e8f0fe',
      },
      boxShadow: {
        'panel': '0 14px 34px rgba(25, 44, 63, 0.08)',
        'soft': '0 4px 20px rgba(148, 163, 184, 0.08), 0 1px 3px rgba(148, 163, 184, 0.06)',
        'elevated': '0 10px 40px rgba(99, 102, 241, 0.08), 0 2px 8px rgba(99, 102, 241, 0.04)',
      },
      backgroundImage: {
        'gradient-soft': 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e8f0fe 100%)',
        'gradient-primary': 'linear-gradient(to right, #3b82f6, #6366f1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
