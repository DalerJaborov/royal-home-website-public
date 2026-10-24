export function lighthouseIssues(report, expectedUrl) {
  const issues = [];
  if (report.runtimeError) issues.push(`Lighthouse runtime error: ${report.runtimeError.code || 'unknown'}`);
  if (report.finalDisplayedUrl !== expectedUrl) issues.push('Unexpected final page URL');
  for (const category of ['performance', 'seo', 'accessibility']) {
    const score = report.categories?.[category]?.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) issues.push(`No valid ${category} score`);
  }
  if (report.audits?.['http-status-code']?.score !== 1) issues.push('Document HTTP status check failed');
  if (report.categories?.seo?.score !== 1) issues.push('SEO audits regressed below 100');
  if (report.categories?.accessibility?.score < 0.9) issues.push('Accessibility regressed below 90');
  // Performance is reported, not gated by an arbitrary lab threshold. Network
  // location, edge challenges and CPU differ from real-user Core Web Vitals.
  return issues;
}
