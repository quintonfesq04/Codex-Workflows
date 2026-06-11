import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function getWordPressConfig() {
  const baseUrl = process.env.WP_BASE_URL?.replace(/\/+$/, '');
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  const missing = [];
  if (!baseUrl) missing.push('WP_BASE_URL');
  if (!username) missing.push('WP_USERNAME');
  if (!appPassword) missing.push('WP_APP_PASSWORD');

  if (missing.length) {
    throw new Error(`Missing required environment values: ${missing.join(', ')}`);
  }

  return { baseUrl, username, appPassword };
}

export function wordpressHeaders(config) {
  const token = Buffer.from(`${config.username}:${config.appPassword}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function wordpressFetch(pathname, options = {}) {
  const config = getWordPressConfig();
  const url = new URL(pathname, `${config.baseUrl}/`);
  const res = await fetch(url, {
    ...options,
    headers: {
      ...wordpressHeaders(config),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail = typeof body === 'object' && body ? body.message || body.code : body;
    throw new Error(`WordPress request failed: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ''}`);
  }

  return body;
}
