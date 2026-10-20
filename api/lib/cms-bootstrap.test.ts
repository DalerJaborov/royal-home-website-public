import { expect, it } from 'vitest';
import { serializeCmsBootstrap, parseCmsBootstrap } from '@contracts/cms-bootstrap';
const now=1_800_000_000_000;
it('seeds only public sections, safely escaping script boundaries and rejecting stale or private snapshots', () => {
  const data={hero:{title:'</script><script>alert(1)</script>'},site:{phone:'+992 44 650 14 14'},services:[]};
  const source=serializeCmsBootstrap({...data,anthropicApiKey:'private',blogAutogenRetryAt:'private'},now)!;
  expect(source).not.toContain('</script>');expect(source).not.toContain('private');
  expect(parseCmsBootstrap(source,now)?.data).toEqual(data);
  expect(parseCmsBootstrap(source,now+30001)).toBeUndefined();
  expect(parseCmsBootstrap(source,now-5001)).toBeUndefined();
  const value=JSON.parse(source);value.data.anthropicApiKey='private';
  expect(parseCmsBootstrap(JSON.stringify(value),now)).toBeUndefined();
  expect(parseCmsBootstrap(JSON.stringify({...value,data:{hero:'broken'}}),now)).toBeUndefined();
  expect(parseCmsBootstrap('broken',now)).toBeUndefined();
});
