// prisma.config.ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  // path to your Prisma schema
  schema: './prisma/schema.prisma',

  // where migrations should be stored
  migrations: {
    path: './prisma/migrations',
  },

  // Prisma 7: connection URL now lives here, not in schema.prisma
  datasource: {
    url: env('DATABASE_URL'),
  },
})
