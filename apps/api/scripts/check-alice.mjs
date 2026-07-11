import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = join(__dirname, '..', '..', '..', '.env');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}
loadEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const c = await pool.connect();
const r = await c.query("SELECT id, email, email_verified_at FROM users WHERE email = 'alice@verify.test'");
console.log('User row:', r.rows[0]);
const v = await c.query("SELECT user_id, expires_at, used_at FROM verification_tokens ORDER BY created_at DESC LIMIT 3");
console.log('Recent tokens:', v.rows);
const a = await c.query("SELECT user_id, action, metadata, created_at FROM auth_audit_logs ORDER BY created_at DESC LIMIT 5");
console.log('Recent audit:', a.rows);
c.release();
await pool.end();
