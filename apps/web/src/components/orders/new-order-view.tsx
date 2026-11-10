import { PageHeader } from '@/components/ui/page-header';
import { OrderForm } from './order-form';

const DESCRIPTION =
  'Enter an amount and the model portfolio weights to get the orders to place for each stock. Quantities are rounded down, and orders placed outside market hours run at the next open.';

export function NewOrderView() {
  return (
    <div className="space-y-8">
      <PageHeader title="Split a portfolio order" description={DESCRIPTION} />
      <OrderForm />
    </div>
  );
}
