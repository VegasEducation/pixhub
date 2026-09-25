// Minimal .env loader. Exists so pixhub has zero runtime dependencies —
// dotenv is a fine library, we just don't need 100% of it for KEY=value lines.

import { readFileSync, existsSync } from 'node:fs';

/**
 * Parse .env text into a plain object.
 * Supports: comments, blank lines, `export ` prefix, single/double quotes,
 * and \n escapes inside double quotes. Values are never coerced — always strings.
 */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();

    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
      value = value.slice(1, -1);
    } else {
      // Strip trailing inline comment on unquoted values: FOO=bar # note
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }

    out[key] = value;
  }
  return out;
}

/**
 * Load a .env file into process.env. Real environment variables always win,
 * so `docker run -e` and compose `environment:` override the file as expected.
 */
export function loadEnv(path = '.env') {
  if (!existsSync(path)) return {};
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return parsed;
}
