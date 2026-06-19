type CorsCallback = (error: Error | null, allow?: boolean) => void;

export const defaultCorsOrigins = [
  'http://localhost:4200',
  'http://localhost:8080',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

const privateNetworkOriginPattern =
  /^https?:\/\/(?:(?:localhost|127\.0\.0\.1)|(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(?:192\.168\.\d{1,3}\.\d{1,3})|(?:172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(?::\d+)?$/;

export const getCorsOrigins = (value = process.env.CORS_ORIGIN) => {
  const configuredOrigins = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : defaultCorsOrigins;
};

export const isAllowedCorsOrigin = (origin: string | undefined) => {
  if (!origin) {
    return true;
  }

  if (getCorsOrigins().includes(origin)) {
    return true;
  }

  return process.env.NODE_ENV !== 'production' && privateNetworkOriginPattern.test(origin);
};

export const corsOrigin = (origin: string | undefined, callback: CorsCallback) => {
  callback(null, isAllowedCorsOrigin(origin));
};
