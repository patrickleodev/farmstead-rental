import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getNestTypeOrmOptions } from './database/typeorm.config';

const envFilePath = [
  process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : undefined,
  '.env.local',
  '.env',
].filter((path): path is string => Boolean(path));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => getNestTypeOrmOptions(),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
