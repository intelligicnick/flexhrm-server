/** Hostinger / PaaS may expose the listen port under different env var names. */
export function resolveListenPort(): number {
  const candidates = [
    process.env.PORT,
    process.env.SERVER_PORT,
    process.env.PASSENGER_PORT,
    process.env.APP_PORT,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed && /^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
  }
  return process.env.NODE_ENV === 'production' ? 3000 : 3001;
}
