---
name: Orval Zod generation
description: Compatibility constraints for regenerating the shared Zod API package.
---

Keep Orval’s Zod output on the same major version as the workspace dependency. Orval can also generate a barrel that re-exports a parameter type from both the schema API and the TypeScript types, which TypeScript rejects as an ambiguous export.

**Why:** A generator run can appear successful while the follow-up workspace typecheck fails, blocking the API build.

**How to apply:** After changing the OpenAPI contract or generator config, regenerate and run the library typecheck; inspect generated barrels for duplicate value/type names before treating codegen as complete.