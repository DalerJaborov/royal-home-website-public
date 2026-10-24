import { readFileSync } from 'node:fs';
import { lighthouseIssues } from './lib/seo-lighthouse.mjs';
const [file, expectedUrl] = process.argv.slice(2);
if (!file || !expectedUrl) throw Error('Usage: node scripts/check-lighthouse.mjs report.json expected-url');
const report = JSON.parse(readFileSync(file, 'utf8'));
const issues = lighthouseIssues(report, expectedUrl);
console.log(JSON.stringify({ url: report.finalDisplayedUrl,
  scores: Object.fromEntries(['performance', 'seo', 'accessibility'].map(key => [key, report.categories?.[key]?.score])), issues }, null, 2));
if (issues.length) process.exitCode = 1;
