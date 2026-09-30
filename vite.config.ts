import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * En local (`pnpm dev`), exécute les fonctions serverless de api/ comme le ferait Vercel :
 * /api/send-template → api/send-template.ts (export default handler(req, res)).
 */
function vercelApiDev(): Plugin {
  return {
    name: 'tts-vercel-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const m = url.pathname.match(/^\/api\/([a-z0-9-]+)$/)
        if (!m) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`)
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          const r = req as IncomingMessage & { body?: unknown; query?: Record<string, string> }
          r.body = raw && (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(raw) : raw
          r.query = Object.fromEntries(url.searchParams)
          const s = res as ServerResponse & { status: (c: number) => typeof s; json: (b: unknown) => void; send: (b: unknown) => void }
          s.status = (c: number) => { res.statusCode = c; return s }
          s.json = (b: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)) }
          s.send = (b: unknown) => { res.end(typeof b === 'string' ? b : JSON.stringify(b)) }
          await mod.default(r, s)
        } catch (e) {
          server.config.logger.error(String((e as Error)?.stack ?? e))
          if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Erreur serveur locale' })) }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Rend toutes les variables de .env.local visibles des fonctions api/ en local (process.env).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), vercelApiDev()],
    server: { port: 5173 },
    optimizeDeps: { exclude: ['@imgly/background-removal'] },
  }
})
