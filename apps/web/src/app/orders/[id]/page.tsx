import { portfolioOrderIdParamsSchema } from '@order-splitter/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { portfolioOrdersApi } from '@/server/api-client';
import { OrderDetailsView } from '@/components/orders/order-details-view';

export const metadata: Metadata = { title: 'Order details' };

export default async function OrderDetailsPage({ params }: PageProps<'/orders/[id]'>) {
  // An id that is not a UUID cannot exist, so there is no need to ask the API.
  const parsed = portfolioOrderIdParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const order = await portfolioOrdersApi.get(parsed.data.id);
  if (!order) notFound();
  return <OrderDetailsView order={order} />;
}
