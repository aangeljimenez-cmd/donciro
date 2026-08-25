// src/pages/api/clientes/logout.js
import { SESSION_COOKIE_NAME } from '../../../lib/auth.js';

export const prerender = false;

export async function POST({ cookies }) {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}