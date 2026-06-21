import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import cookieParser = require('cookie-parser');
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
    // Android WebView bundled assets and some mobile browsers send this literal value.
    if (origin === 'null') return true;
    if (corsOrigins.includes(origin)) return true;
    try {
      const { hostname } = new URL(origin);
      if (hostname.endsWith('.hostingersite.com')) return true;
      // Capacitor/WebViewAssetLoader domain for the supervisor APK.
      if (hostname === 'appassets.androidplatform.net') return true;
    } catch {
      return false;
    }
    if (!isProduction) {
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return true;
      }
      try {
        const { hostname } = new URL(origin);
        if (
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
        ) {
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  // Default helmet CORP is `same-origin`, which blocks cross-origin browser fetch()
  // even when CORS headers are present (frontend and API are on separate Hostinger hosts).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
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
  console.log(`Flex HRM API running on http://0.0.0.0:${port}/api [mongodb]`);
}

bootstrap();
