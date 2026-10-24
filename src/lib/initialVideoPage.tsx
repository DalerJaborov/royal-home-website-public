import { lazy } from 'react';
import { resolvePublicPath } from '@contracts/public-i18n';

const load = () => import('@/pages/ListingVideoPage');
const DeferredVideo = lazy(load);
let prepared: Awaited<ReturnType<typeof load>> | undefined;

// eslint-disable-next-line react-refresh/only-export-components -- The client must resolve the same SSR boundary before hydration.
export async function prepareInitialVideo(path: string) {
  if (/^\/listing\/[1-9]\d*\/video$/.test(resolvePublicPath(path).basePath)) prepared = await load();
}

export function InitialVideoPage() {
  const Page = prepared?.default ?? DeferredVideo;
  return <Page />;
}
