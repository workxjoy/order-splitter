import Link from 'next/link';
import { StatusCard } from '@/components/ui/status-card';
import { AppRoute } from '@/lib/constants';

export default function OrderNotFound() {
  return (
    <StatusCard
      title="Order not found"
      message="That order does not exist. History is kept in memory, so it is cleared whenever the API restarts."
      action={
        <Link href={AppRoute.HISTORY} className="btn-primary">
          Back to order history
        </Link>
      }
    />
  );
}
