import process from 'node:process';

const webhookUrl = process.env.UBSC_UPTIME_ALERT_WEBHOOK_URL?.trim();

if (!webhookUrl) {
    console.log('No external uptime webhook configured; GitHub incident remains the alert channel.');
    process.exit(0);
}

const url = new URL(webhookUrl);

if (url.protocol !== 'https:') {
    throw new Error('UBSC_UPTIME_ALERT_WEBHOOK_URL must use HTTPS.');
}

const transition = process.env.UPTIME_TRANSITION || 'unknown';
const payload = {
    schema_version: 1,
    source: 'github-external-synthetic',
    event: transition === 'opened' ? 'availability.outage' : 'availability.recovered',
    status: transition === 'opened' ? 'outage' : 'operational',
    transition,
    checked_at: new Date().toISOString(),
    repository: process.env.GITHUB_REPOSITORY || null,
    run_url: process.env.UPTIME_RUN_URL || null,
};
const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'UBSC-External-Availability/1.0',
};
const token = process.env.UBSC_UPTIME_ALERT_WEBHOOK_TOKEN?.trim();

if (token) {
    headers.authorization = `Bearer ${token}`;
}

const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
});

if (!response.ok) {
    throw new Error(`External alert webhook returned HTTP ${response.status}.`);
}

console.log(`External uptime transition delivered: ${transition}.`);
