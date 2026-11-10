import type { Metadata } from 'next';
import { NewOrderView } from '@/components/orders/new-order-view';

export const metadata: Metadata = { title: 'New order' };

export default function NewOrderPage() {
  return <NewOrderView />;
}
