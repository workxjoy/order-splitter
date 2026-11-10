import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library can't register cleanup itself because Vitest globals are off.
afterEach(cleanup);
