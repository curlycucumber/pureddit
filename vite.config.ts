import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import auth from './api/auth/[action].ts';
import reddit from './api/reddit.ts';
import readOnly from './api/read-only.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.url?.split('?')[0] === '/api/read-only') { void readOnly(req, res); return; }
  if (req.url?.startsWith('/api/auth/')) { void auth(req, res); return; }
  if (req.url?.split('?')[0] === '/api/reddit') { void reddit(req, res); return; }
  next();
}

const localApi: Plugin = {
  name: 'pureddit-local-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware);
  },
  configurePreviewServer(server) { server.middlewares.use(apiMiddleware); },
};

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), '');
  for (const name of ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REDIRECT_URI', 'REDDIT_USER_AGENT', 'SESSION_SECRET']) {
    if (values[name]) process.env[name] = values[name];
  }
  return { plugins: [react(), localApi] };
});
