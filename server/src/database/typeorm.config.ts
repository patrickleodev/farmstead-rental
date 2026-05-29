import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

type Env = Record<string, string | undefined>;

const toBoolean = (value: string | undefined, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toNumber = (value: string | undefined, defaultValue: number) => {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const buildSslOptions = (env: Env) => {
  if (!toBoolean(env.DB_SSL, true)) {
    return false;
  }

  return {
    rejectUnauthorized: toBoolean(env.DB_SSL_REJECT_UNAUTHORIZED, false),
  };
};

export const getDataSourceOptions = (
  env: Env = process.env,
): DataSourceOptions => {
  const ssl = buildSslOptions(env);
  const baseOptions: DataSourceOptions = {
    type: 'postgres',
    schema: env.DB_SCHEMA ?? 'public',
    ssl,
    synchronize: toBoolean(env.TYPEORM_SYNC),
    logging: toBoolean(env.TYPEORM_LOGGING),
    migrationsRun: toBoolean(env.TYPEORM_MIGRATIONS_RUN),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
  };

  if (env.DATABASE_URL) {
    return {
      ...baseOptions,
      url: env.DATABASE_URL,
    };
  }

  return {
    ...baseOptions,
    host: env.DB_HOST,
    port: toNumber(env.DB_PORT, 5432),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME ?? 'postgres',
  };
};

export const getNestTypeOrmOptions = (
  env: Env = process.env,
): TypeOrmModuleOptions => ({
  ...getDataSourceOptions(env),
  autoLoadEntities: true,
});
