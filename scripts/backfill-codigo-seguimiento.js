import 'dotenv/config';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function generarCodigoSeguimiento() {
  return crypto.randomBytes(20).toString('hex');
}

const [rows] = await pool.query(
  'SELECT id FROM pedidos WHERE codigo_seguimiento IS NULL'
);

for (const row of rows) {
  const codigo = generarCodigoSeguimiento();
  await pool.query(
    'UPDATE pedidos SET codigo_seguimiento = ? WHERE id = ?',
    [codigo, row.id]
  );
}

console.log(`Actualizados ${rows.length} pedidos.`);
process.exit(0);
