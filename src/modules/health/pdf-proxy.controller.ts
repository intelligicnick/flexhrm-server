import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { RequireAnyPermissions } from '../../common/decorators/auth.decorators';

const ALLOWED_HOSTS = [
  'bidplus.gem.gov.in',
  'fulfilment.gem.gov.in',
  'ik.imagekit.io',
];

function isAllowedPdfUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

@Controller('proxy')
export class PdfProxyController {
  @Get('pdf')
  @RequireAnyPermissions(['bids', 'renewals'], 'view')
  async proxyPdf(@Query('url') url: string, @Res() res: Response) {
    const trimmed = url?.trim() ?? '';
    if (!trimmed || !isAllowedPdfUrl(trimmed)) {
      throw new BadRequestException('Invalid or disallowed PDF URL');
    }

    const upstream = await fetch(trimmed, {
      headers: { Accept: 'application/pdf,*/*' },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      throw new BadRequestException(`Upstream PDF request failed (${upstream.status})`);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type')?.includes('pdf')
      ? upstream.headers.get('content-type')!
      : 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }
}
