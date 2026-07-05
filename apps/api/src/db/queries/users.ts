import { query } from '../index';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createUser(data: {
  email: string;
  name: string;
  passwordHash: string;
  role: string;
}): Promise<UserRow> {
  const result = await query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.email, data.name, data.passwordHash, data.role],
  );
  return result.rows[0];
}
