import { envListOrDevDefault, envOrDevDefault } from './env';

export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: envOrDevDefault(
    'MONGODB_URI',
    process.env.MONGODB_URI,
    'mongodb://127.0.0.1:27017/flexhrm',
  ),
  corsOrigins: envListOrDevDefault(
    'CORS_ORIGINS',
    process.env.CORS_ORIGINS,
    'http://localhost:3000',
  ),
  seedOnStartup: process.env.SEED_ON_STARTUP !== 'false',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123',
  migrateSourceDir: process.env.MIGRATE_SOURCE_DIR ?? '../',
  bulkPayExportDir: process.env.BULK_PAY_EXPORT_DIR ?? '',
});
