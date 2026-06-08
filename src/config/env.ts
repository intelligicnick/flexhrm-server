const isProduction = process.env.NODE_ENV === 'production';

export function envOrDevDefault(
  name: string,
  value: string | undefined,
  devDefault: string,
): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return devDefault;
}

export function envListOrDevDefault(
  name: string,
  value: string | undefined,
  devDefault: string,
): string[] {
  const raw = envOrDevDefault(name, value, devDefault);
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
