---
name: Expo preview startup
description: Non-obvious startup constraints for the school management Expo web preview.
---

The Expo web preview must run through the managed mobile artifact workflow, and its development command should not add the old Replit-specific host overrides or `--localhost` flag.

**Why:** Those overrides caused the web listener to accept connections without returning the app shell, while the plain Expo web command served the login screen correctly.

**How to apply:** Prefer `artifacts/mobile: expo` and keep its command as `pnpm exec expo start --web --port ${PORT:-18115}`. Run the API separately through `artifacts/api-server: API Server`; do not use the retired combined launcher.