import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/**
 * jsdom no implementa `scrollIntoView`, que el selector usa para mantener a la
 * vista la opción resaltada mientras se navega con el teclado.
 */
Element.prototype.scrollIntoView = vi.fn();
