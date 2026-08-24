#!/usr/bin/env bash
set -e

# Install pnpm to home directory (avoids read-only /usr/bin and /usr/lib on Render)
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

if ! command -v pnpm &> /dev/null; then
  curl -fsSL https://get.pnpm.io/install.sh | sh -
  # Reload PATH after install
  export PATH="$PNPM_HOME:$PATH"
fi

# Install all workspace dependencies (allow postinstall scripts for esbuild etc.)
pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# Build the api-server
pnpm --filter @workspace/api-server run build

# Reset connections file so the app prompts DB setup on first run
echo '{"activeId":null,"connections":[]}' > artifacts/api-server/data/connections.json
