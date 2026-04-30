import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
