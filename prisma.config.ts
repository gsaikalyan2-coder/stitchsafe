// Prisma 7 config. The CLI (migrate, studio) uses DIRECT_URL (session pooler, port 5432).
// The app runtime uses DATABASE_URL (transaction pooler, port 6543) via the PrismaPg adapter in src/server/db.ts.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
