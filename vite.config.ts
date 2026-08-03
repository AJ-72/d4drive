import { defineConfig } from 'vite';

// The dev server must honour the PORT assigned by the harness (autoPort in
// .claude/launch.json). Vite otherwise pins 5173 and collides with anything
// already holding it. No hardcoded --port flag lives in package.json either;
// both would defeat autoPort.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
});
