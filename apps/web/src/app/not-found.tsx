import Link from 'next/link';
import { StatusCard } from '@/components/ui/status-card';
import { AppRoute } from '@/lib/constants';

export default function NotFound() {
  return (
    <StatusCard
      title="Page not found"
      message="There is nothing at this address. Check the link, or start a new order."
      action={
        <Link href={AppRoute.NEW_ORDER} className="btn-primary">
          New order
        </Link>
      }
    />
  );
}
