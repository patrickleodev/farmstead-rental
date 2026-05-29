import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const defaultCorsOrigins = [
    'http://localhost:4200',
    'http://localhost:8080',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
  ];
  const configuredCorsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigins = configuredCorsOrigins?.length
    ? configuredCorsOrigins
    : defaultCorsOrigins;

  app.enableCors({
    origin: corsOrigins,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
