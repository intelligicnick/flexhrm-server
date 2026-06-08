import { BulkPayExport } from '../../database/schemas/bulk-pay-export.schema';

/** API-safe bulk pay record — never exposes server file paths or file payload. */
export type PublicBulkPayExport = Omit<
  BulkPayExport,
  'storedPath' | 'fileDataBase64'
>;

/** axis_bulkpay_{Month}_{Year}_{YYYY-MM-DD}.xls — matches Axis bank export naming. */
export function buildAxisBulkPayFilename(
  month: string,
  year: string,
  exportDate: Date,
): string {
  const slug = `${month.trim()}_${year.trim()}`.replace(/\s+/g, '_');
  const dateStr = exportDate.toISOString().split('T')[0];
  return `axis_bulkpay_${slug}_${dateStr}.xls`;
}

export function toPublicBulkPayExport(
  record: BulkPayExport | (BulkPayExport & { storedPath?: string }),
): PublicBulkPayExport {
  const {
    storedPath: _storedPath,
    fileDataBase64: _fileDataBase64,
    ...rest
  } = record as BulkPayExport;
  const createdAt = rest.createdAt ? new Date(rest.createdAt) : new Date();
  return {
    ...rest,
    filename: buildAxisBulkPayFilename(rest.month, rest.year, createdAt),
  };
}
