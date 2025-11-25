import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Change 'repo-name' to your actual GitHub repository name if deploying to GitHub Pages
  // e.g., base: '/iir-filter-designer/'
  base: './', 
})
