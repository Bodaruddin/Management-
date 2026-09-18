import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl =
  process.env.RENDER_DATABASE_URL ??
  process.env.APP_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("RENDER_DATABASE_URL, ensure the hosted database is configured");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
