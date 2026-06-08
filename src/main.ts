import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import compression = require('compression');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3001;
  const nodeEnv = config.get<string>('nodeEnv') ?? 'development';
  const corsOrigins = config.get<string[]>('corsOrigins') ?? [];
  const isProduction = nodeEnv === 'production';

  function isAllowedCorsOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    if (corsOrigins.includes(origin)) return true;
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith('.hostingersite.com')) return true;
    } catch {
      return false;
    }
    if (!isProduction) {
      return (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      );
    }
    return false;
  }

  app.setGlobalPrefix('api');
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  await app.listen(port, '0.0.0.0');
  const mongodbUri = config.get<string>('mongodbUri') ?? '';
  // #region agent log
  try {
    const parsed = new URL(mongodbUri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://'));
    fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2742dd'},body:JSON.stringify({sessionId:'2742dd',location:'main.ts:bootstrap',message:'Backend started',data:{port,hostname:parsed.hostname,dbName:parsed.pathname.replace(/^\//,'')},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  } catch { /* ignore */ }
  // #endregion
  console.log(`Flex HRM API running on http://0.0.0.0:${port}/api [mongodb]`);
}

bootstrap();
