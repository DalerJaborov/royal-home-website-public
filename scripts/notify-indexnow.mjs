import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const path = option('urls');
if (!path) throw Error('Provide --urls=<JSON file containing only newly added or meaningfully changed public URLs>');
const list = JSON.parse(await readFile(path, 'utf8'));
if (!Array.isArray(list) || !list.length || list.length > 10000 || list.some(value => typeof value !== 'string')) throw Error('Invalid URL list');
const urls = [...new Set(list)];
for (const value of urls) {
  const url = new URL(value);
  if (url.origin !== 'https://royalhome.tj' || url.search || url.hash || /^\/(?:admin|api|trpc|login)(?:\/|$)/.test(url.pathname)) throw Error('Only canonical public royalhome.tj URLs are allowed');
}
const hash = createHash('sha256').update(JSON.stringify(urls)).digest('hex');
if (!process.argv.includes('--submit')) {
  console.log(JSON.stringify({ dryRun: true, count: urls.length, urlsHash: hash }));
} else {
  // Public domain-ownership proof, served as plaintext; no account credentials.
  const key = (await readFile(new URL('../public/indexnow-key.txt', import.meta.url), 'utf8')).trim();
  if (!/^[a-f0-9]{32}$/.test(key)) throw Error('Invalid IndexNow ownership proof');
  const keyLocation = 'https://royalhome.tj/indexnow-key.txt';
  const proof = await fetch(keyLocation, { signal: AbortSignal.timeout(15000) });
  if (proof.status !== 200 || (await proof.text()).trim() !== key) throw Error('Published ownership proof is unavailable or stale');
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'royalhome.tj', key, keyLocation, urlList: urls }), signal: AbortSignal.timeout(30000),
  });
  const receipt = { submittedAt: new Date().toISOString(), count: urls.length, status: response.status, urlsHash: hash,
    result: response.status === 200 ? 'received' : response.status === 202 ? 'received-key-validation-pending' : 'rejected',
    indexed: 'not-confirmed' };
  if (option('report')) await writeFile(option('report'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  if (![200, 202].includes(response.status)) process.exitCode = 1;
}
