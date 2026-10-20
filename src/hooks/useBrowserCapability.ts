import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
const serverSnapshot = () => false;

/** First hydration render matches the server; browser-only features follow after it. */
export function useBrowserCapability(test: () => boolean): boolean {
  return useSyncExternalStore(subscribe, test, serverSnapshot);
}
