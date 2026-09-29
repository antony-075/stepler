import { a } from './cycle-a.js';

export const b = (): number => (a.length > 0 ? 1 : 0);
