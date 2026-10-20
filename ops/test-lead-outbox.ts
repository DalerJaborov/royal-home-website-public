// Destructive ONLY to a dedicated disposable database, never to production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { execFileSync } from 'node:child_process';
import { acceptQueuedLead, claimLeadDelivery, finishLeadDelivery } from '../api/queries/lead-deliveries';
import { drainLeadDeliveries } from '../api/lib/lead-delivery-worker';

const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.pathname, '/royalhome_outbox_test');
assert(['localhost', '127.0.0.1', 'outbox-mysql'].includes(url.hostname));
assert.notEqual(process.env.NODE_ENV, 'production');
if (process.argv.includes('--claim-only')) {
  console.log(JSON.stringify(await claimLeadDelivery()));
  process.exit(0);
}
const connection = await mysql.createConnection(process.env.DATABASE_URL!);
await connection.query(`CREATE TABLE leads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), phone VARCHAR(50) NOT NULL,
  message TEXT, source VARCHAR(100) NOT NULL, status ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
  crm_client_id VARCHAR(36), createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await connection.query(readFileSync('ops/lead-deliveries.sql', 'utf8'));
const data = { name: 'ISOLATED TEST', phone: '+992000000000', source: 'isolated-test', message: 'mock delivery only',
  attribution: { landingPath: '/sell', referrerHost: 'www.google.com', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'sell_2026' } };
const first = await acceptQueuedLead(data, 'https://royalhome.tj/listings?utm_source=test');
const claims = await Promise.all(Array.from({ length: 8 }, () => claimLeadDelivery()));
assert.equal(claims.filter(Boolean).length, 1, 'only one worker can claim');
const job = claims.find(Boolean)!;
assert.equal(job.leadId, first);
assert.equal(job.payload.pageUrl, 'https://royalhome.tj/listings');
assert.ok(job.payload.comment.includes('Первая страница: /sell\nПереход с: www.google.com\nutm_source: google\nutm_medium: cpc\nutm_campaign: sell_2026'));
// Simulate process death: an expired lease must be reclaimed without a new lead.
await connection.query('UPDATE lead_deliveries SET lease_until=DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE lead_id=?', [first]);
const reclaimed = JSON.parse(execFileSync(process.execPath, [process.argv[1], '--claim-only'], { encoding: 'utf8', timeout: 15000, windowsHide: true })) as typeof job;
assert.equal(reclaimed.attempts, 2);
assert.notEqual(reclaimed.leaseToken, job.leaseToken);
await finishLeadDelivery(job, { clientId: 'stale-worker' }, new Date());
let [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT crm_client_id FROM leads WHERE id=?', [first]);
assert.equal(rows[0].crm_client_id, null, 'expired owner cannot acknowledge');
await finishLeadDelivery(reclaimed, { error: 'TimeoutError', retryable: true }, new Date(Date.now() - 1000));
const payloads: unknown[] = [];
await drainLeadDeliveries({ claim: claimLeadDelivery, finish: finishLeadDelivery, deliver: async (payload) => {
  payloads.push(payload); return { clientId: 'mock-client' };
} });
assert.deepEqual(payloads, [job.payload]);
[rows] = await connection.query<mysql.RowDataPacket[]>('SELECT l.crm_client_id, d.state, d.attempts FROM leads l JOIN lead_deliveries d ON d.lead_id=l.id WHERE l.id=?', [first]);
assert.equal(rows[0].crm_client_id, 'mock-client'); assert.equal(rows[0].state, 'delivered'); assert.equal(rows[0].attempts, 3);
assert.equal(await claimLeadDelivery(), null, 'acknowledged job never redelivers');
// A queue write failure must roll back the lead, not return success.
await connection.query("CREATE TRIGGER reject_test_queue BEFORE INSERT ON lead_deliveries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback test'");
await assert.rejects(acceptQueuedLead(data));
[rows] = await connection.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM leads'); assert.equal(rows[0].n, 1);
await connection.query('DROP TRIGGER reject_test_queue');
const second = await acceptQueuedLead(data);
const blockedJob = (await claimLeadDelivery())!;
await finishLeadDelivery(blockedJob, { error: 'HTTP_401', retryable: false }, new Date());
assert.equal(await claimLeadDelivery(), null);
[rows] = await connection.query<mysql.RowDataPacket[]>('SELECT state,last_error FROM lead_deliveries WHERE lead_id=?', [second]);
assert.equal(rows[0].state, 'blocked'); assert.equal(rows[0].last_error, 'HTTP_401');
console.log('PASS: atomic acceptance/rollback, 8 concurrent workers, recovery in a new Node process, stale-owner rejection, identical retry payload, durable acknowledgement, blocked authentication failure; CRM transport mocked, no external lead calls');
await connection.end();
process.exit(0);
