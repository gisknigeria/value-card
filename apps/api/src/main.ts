import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Support comma-separated list of allowed origins, e.g.:
  //   WEB_ORIGIN=https://value-card.onrender.com,http://localhost:5173
  const rawOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  const allowedOrigins = rawOrigin.split(',').map(o => o.trim()).filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, mobile apps) and listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} is not allowed`));
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  Logger.log(`API running on port ${port}`, 'Bootstrap');
}

void bootstrap();
