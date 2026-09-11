---
name: Database library build cache
description: Workspace-specific stale declaration behavior between the database package and the API server.
---

When the API imports database tables that are present in lib/db source but missing from the API typecheck, the database package declarations may be stale even after a normal workspace build. Force-rebuild the database project before diagnosing the API imports as code errors.

**Why:** The API server can fail typechecking against an older generated declaration set while the source schema is already correct.

**How to apply:** After schema-related typecheck failures, rebuild the lib/db project and rerun the API typecheck before changing the adapter or schema.