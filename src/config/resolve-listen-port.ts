/**
 * Hostinger injects PORT at runtime. Do not hardcode 3000/3001 in production —
 * falling back to a fixed port when PORT is unset causes 408 from the reverse proxy.
 */
export function resolveListenPort(isProduction: boolean): number {
  const port = Number(process.env.PORT);
  if (Number.isFinite(port) && port > 0) {
    return port;
  }

  if (isProduction) {
    console.error(
      '[Flex HRM] PORT is not set. Hostinger must inject PORT at runtime.\n' +
        '  hPanel → Start command: npm start (not "node dist/server.js" alone)\n' +
        '  Do not set PORT=3000 manually in environment variables.',
    );
    process.exit(1);
  }

  return 3001;
}
