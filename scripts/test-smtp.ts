import 'dotenv/config';
import * as nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const to = process.argv[2] || user;

if (!host || !user || !pass) {
  console.error('Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env');
  process.exit(1);
}

const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
const secure = process.env.SMTP_SECURE === 'true';
const service = process.env.SMTP_SERVICE;

const transporter = service
  ? nodemailer.createTransport({ service, auth: { user, pass } })
  : nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      ...(port === 587 && !secure ? { requireTLS: true } : {}),
    });

async function main() {
  console.log(`Verifying SMTP (${service || host}:${port})...`);
  await transporter.verify();
  console.log('SMTP connection OK');

  const from = process.env.SMTP_FROM || user;
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Flex HRM — SMTP test',
    text: `SMTP test sent at ${new Date().toISOString()}`,
  });
  console.log(`Test email sent to ${to} (messageId: ${info.messageId})`);
}

main().catch((err: Error) => {
  console.error('SMTP test failed:', err.message);
  process.exit(1);
});
