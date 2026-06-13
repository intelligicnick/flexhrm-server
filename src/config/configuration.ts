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
  employeeAssetsDir: process.env.EMPLOYEE_ASSETS_DIR ?? '',
  companyName: process.env.COMPANY_NAME ?? 'INTELLIGIC SOLUTIONS',
  companyAddress:
    process.env.COMPANY_ADDRESS ??
    'Head Office: F-164, B Wing Express Zone, Western Express Hwy, Malad East, Mumbai, Maharashtra 400097',
  companyPhone: process.env.COMPANY_PHONE ?? '9029965109',
  companyEmail: process.env.COMPANY_EMAIL ?? 'info@intelligic.co.in',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFrom: process.env.SMTP_FROM ?? '',
  idCardVerifyBaseUrl:
    process.env.ID_CARD_VERIFY_BASE_URL ??
    'https://greenyellow-woodpecker-750354.hostingersite.com/employee',
});
