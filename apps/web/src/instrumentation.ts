// Runs once when the server starts. A bad setting is reported there, and Next.js then answers every
// request with a 500, rather than orders failing later with a misleading "could not be confirmed".
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { trustedProxyCount } = await import('./lib/client-address');
  trustedProxyCount();
}
