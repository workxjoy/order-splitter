'use client';

import { useEffect } from 'react';
import { StatusCard } from '@/components/ui/status-card';
import { ErrorMessage } from '@/lib/constants';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Loads the page from the server again, then re-renders it. `reset` would only re-render, which
  // shows the same failure.
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusCard
      role="alert"
      title="Something went wrong"
      message={ErrorMessage.SERVICE_UNAVAILABLE}
      footnote={error.digest && `Reference: ${error.digest}`}
      action={
        <button type="button" className="btn-primary" onClick={retry}>
          Try again
        </button>
      }
    />
  );
}
