# Site

Built with AI Fiesta. React 19 + Vite + TypeScript + Tailwind v4 + React Router.

```sh
pnpm install
pnpm dev     # http://localhost:5173
pnpm build   # typecheck, then dist/
```

Everything under `src/` and `public/` is yours to edit. The build
configuration, the lockfile and `src/main.tsx` are locked so the site keeps
building and publishing.

There is no template here: no header, footer or navigation, no section blocks,
and no page beyond a placeholder home and a 404. `src/components/ui` holds
unstyled shadcn primitives; every page and every section is composed for this
site alone.
