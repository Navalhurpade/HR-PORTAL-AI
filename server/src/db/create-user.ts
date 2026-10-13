import 'dotenv/config';
import { createInterface } from 'node:readline';
import { emitKeypressEvents } from 'node:readline';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

type UserRole = 'employee' | 'hr' | 'super_admin';

function parseArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith('--')) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

function promptPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');
  }

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('Set account password (minimum 12 characters): ');

  return new Promise((resolve, reject) => {
    let password = '';
    const cleanup = () => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Password entry cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(password);
      } else if (key.name === 'backspace') {
        password = password.slice(0, -1);
      } else if (character && !key.ctrl) {
        password += character;
      }
    };
    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userId = args.get('user-id')?.trim();
  const name = args.get('name')?.trim();
  const email = args.get('email')?.trim().toLowerCase();
  const role = args.get('role') as UserRole | undefined;
  const department = args.get('department')?.trim();
  const managerId = args.get('manager-id')?.trim() || null;

  if (!userId || !name || !email || !department || !role) {
    throw new Error(
      'Required: --user-id ID --name NAME --email EMAIL --role employee|hr|super_admin --department DEPARTMENT [--manager-id ID]',
    );
  }
  if (!['employee', 'hr', 'super_admin'].includes(role)) {
    throw new Error('--role must be employee, hr, or super_admin.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('--email must be a valid email address.');
  }

  const password = await promptPassword();
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (user_id, name, email, role, department, manager_id, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, name, email, role, department, manager_id`,
    [userId, name, email, role, department, managerId, passwordHash],
  );
  console.info('Created account:', result.rows[0]);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not create account.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
