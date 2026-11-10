import { z } from 'zod';

export const paginationMetaSchema = z
  .object({
    page: z.int(),
    pageSize: z.int(),
    totalItems: z.int(),
    totalPages: z.int(),
  })
  .meta({ id: 'PaginationMeta' });
export type PaginationMeta = z.output<typeof paginationMetaSchema>;
