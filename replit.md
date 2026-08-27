# School Management App

A mobile-first school administration app for managing students, teachers, attendance, exams, fees, salaries, alumni, and school documents.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `RENDER_DATABASE_URL` — hosted PostgreSQL connection string
- Required secret for Expo builds: `EXPO_TOKEN` — stored securely in Replit Secrets

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mobile` — Expo Router mobile app and mobile build configuration
- `artifacts/api-server` — Express API and database connection manager
- `lib/db` — shared database schema and Drizzle helpers
- `render.yaml` — Render web service configuration
- `eas.json` — Expo build profiles

## Architecture decisions

- Hosted deployments use `RENDER_DATABASE_URL`; legacy `APP_DATABASE_URL` and `DATABASE_URL` names remain fallback-compatible.
- Database connection records are encrypted at rest and the committed connection store starts empty.
- The mobile client receives its API host through `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_DOMAIN`; no database credentials are bundled into the APK.

## Product

- Admin and teacher sign-in
- Student, teacher, class, subject, attendance, exam, result, fee, expense, salary, promotion, inactive-student, alumni, messaging, document branding, and report workflows
- PostgreSQL and Firebase connection management from the admin experience

## User preferences

- Deploy the API with Render and keep the mobile app connected to the hosted API.
- Keep Expo and database credentials out of source control.

## Gotchas

- Android APKs require an Android build toolchain or a supported remote build service; the Replit shell does not include Java/Android SDK by default.
- The mobile artifact uses a static `app.json`; do not introduce `app.config.ts` or `app.config.js`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
