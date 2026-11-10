import { createHash } from 'node:crypto';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

// The request has already been parsed by the schema, so key order and number formats are
// normalised: 100 and "100.00" produce the same hash.
export function hashRequest(request: unknown): string {
  return createHash(HASH_ALGORITHM).update(JSON.stringify(request)).digest(HASH_ENCODING);
}
