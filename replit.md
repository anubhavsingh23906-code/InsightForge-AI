# InsightForge AI

InsightForge AI turns plain-English data questions into transparent, evidence-backed analysis.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/insightforge-ai/src/App.tsx` — responsive dashboard, analysis workspace, results, history, datasets, sources, and reports.
- `artifacts/insightforge-ai/src/index.css` — shared InsightForge visual theme and responsive styling.
- `artifacts/api-server/src/routes/insightforge.ts` — deterministic Demo Mode data engine and API routes.
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and validation schemas.
- `lib/api-client-react/src/generated/` — generated React Query hooks.
- `.env.example` — optional AI/database variables and the workflow secret name.

## Architecture decisions

- The first build uses deterministic synthetic datasets in Demo Mode so every result is reproducible and clearly labelled rather than pretending to be live data.
- The API contract is OpenAPI-first; client hooks and server validators are generated from `lib/api-spec/openapi.yaml`.
- Analysis results carry an explicit plan, execution steps, quality metrics, insight evidence, and calculation details to keep the workflow explainable.
- The server keeps demo state in memory for the MVP; PostgreSQL is reserved for the persistence stage.

## Product

- Ask a natural-language question about synthetic air quality, parking, or weather data.
- Review a visible agent execution timeline, structured plan, charts, insights, data-quality metrics, and provenance evidence.
- Browse analysis history, dataset previews, source inventory, reports, follow-up questions, and deterministic what-if simulations.
- The UI supports desktop and mobile layouts with a responsive navigation shell.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing the OpenAPI contract.
- The frontend and API are separate managed workflows; restart both after changing their run commands or generated contracts.
- Demo analyses are in-memory and reset when the API workflow restarts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
