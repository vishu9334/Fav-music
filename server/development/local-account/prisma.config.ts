import { defineConfig } from '@prisma/config';
import { LocalAccountFiles } from '../../scripts/local-account-files.mjs';

// Explicit config only: the ordinary Neon Prisma config and migration directory are untouched.
const database = process.env['AADAT_LOCAL_DATABASE'] ?? 'aadat_local';
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: './migrations' },
  datasource: { url: LocalAccountFiles.url(database, true) },
});
