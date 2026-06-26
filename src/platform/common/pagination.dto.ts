import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function paginateArray<T>(
  items: T[],
  page = 1,
  pageSize = 50,
): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(500, Math.max(1, pageSize));
  const start = (safePage - 1) * safeSize;
  const slice = items.slice(start, start + safeSize);
  return {
    items: slice,
    total: items.length,
    page: safePage,
    pageSize: safeSize,
    hasMore: start + safeSize < items.length,
  };
}

export async function paginateQuery<T>(
  model: {
    find: (filter: Record<string, unknown>) => {
      sort: (s: Record<string, 1 | -1>) => {
        skip: (n: number) => {
          limit: (n: number) => { lean: () => { exec: () => Promise<T[]> } };
        };
      };
    };
    countDocuments: (filter: Record<string, unknown>) => Promise<number>;
  },
  filter: Record<string, unknown>,
  page = 1,
  pageSize = 50,
  sort: Record<string, 1 | -1> = { createdAt: -1 },
): Promise<PaginatedResult<T>> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(500, Math.max(1, pageSize));
  const skip = (safePage - 1) * safeSize;
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(safeSize).lean().exec(),
    model.countDocuments(filter),
  ]);
  return {
    items,
    total,
    page: safePage,
    pageSize: safeSize,
    hasMore: skip + items.length < total,
  };
}
