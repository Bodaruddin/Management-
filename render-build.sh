#!/usr/bin/env bash
set -euo pipefail

# Keep Render on the pnpm version used to create pnpm-lock.yaml. Using npx
# avoids relying on global install permissions in Render's build container.
PNPM_VERSION="10.26.1"
pnpm() {
  npx --yes "pnpm@${PNPM_VERSION}" "$@"
}

# Install the complete workspace because the API bundle imports shared
# workspace packages during the build.
pnpm install --frozen-lockfile

rm -rf artifacts/api-server/dist
pnpm --filter @workspace/api-server run build

# Connection-manager state is runtime data. Do not reset it during builds;
# the runtime creates it in CONNECTIONS_FILE when needed. On Render, point
# CONNECTIONS_FILE at a persistent disk or use RENDER_DATABASE_URL.
