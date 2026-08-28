import type { LocalAPI } from '../shared/types';
declare global { interface Window { local: LocalAPI; } }
export {};
