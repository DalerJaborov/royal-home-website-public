import type { PublicLocaleDictionary } from './public-i18n';
import type { PublicListing } from './public-listing';
export interface PublicRenderInput {
  path: string;
  cms: Record<string, unknown>;
  inventory: readonly PublicListing[];
  dictionary?: PublicLocaleDictionary;
}
