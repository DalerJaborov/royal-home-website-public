import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PUBLIC_RENDER_QUERIES} from '@contracts/public-render-queries';
describe('public rendering resources in robots',()=>{
  it('allows exactly the declared read procedures while retaining private, authentication and analytics exclusions',()=>{
    const robots=readFileSync(new URL('../../public/robots.txt',import.meta.url),'utf8');
    const allowed=[...robots.matchAll(/^Allow: \/api\/trpc\/(.+)$/gm)].map(m=>m[1]);
    expect(new Set(allowed)).toEqual(PUBLIC_RENDER_QUERIES);
    expect(robots).toContain('Disallow: /api/');expect(robots).toContain('Disallow: /admin');
    for(const path of ['auth.me','lead.create','lead.list','analytics.track','blog.generateArticle'])expect(PUBLIC_RENDER_QUERIES.has(path)).toBe(false);
  });
});
