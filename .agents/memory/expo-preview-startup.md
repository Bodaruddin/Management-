---
name: Expo preview startup
description: Non-obvious startup constraints for the school management Expo web preview.
---

The Expo web preview must run through the managed mobile artifact workflow. Keep this repository's Replit-injected packager settings and localhost behavior unless an actual preview failure is reproduced.

**Why:** The prior no-overrides guidance described an earlier runtime issue. In the current workspace, the committed Expo 57 command starts successfully through the managed workflow and serves the sign-in screen.

**How to apply:** Use `artifacts/mobile: expo`; restart it after dependency changes and inspect its logs and preview before changing host flags. Run the API separately through `artifacts/api-server: API Server`.