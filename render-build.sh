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

# A deployment starts with the hosted database environment variable. Do not
# carry a local connection-manager state file into the deployed service.
printf '%s\n' '{"activeId":null,"connections":[]}' > artifacts/api-server/data/connections.json
