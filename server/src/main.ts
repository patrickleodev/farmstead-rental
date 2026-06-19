import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigin } from './cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: corsOrigin,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
