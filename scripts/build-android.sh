#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/artifacts/mobile"

# EAS must run from the Expo app directory. This wrapper prevents the common
# failure caused by running `eas build` from the monorepo root.
if command -v eas >/dev/null 2>&1; then
  eas build --platform android --profile preview "$@"
else
  pnpm dlx eas-cli@latest build --platform android --profile preview "$@"
fi