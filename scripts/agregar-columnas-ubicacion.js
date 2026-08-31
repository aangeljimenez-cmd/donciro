import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function agregarColumna(nombre, definicion) {
  try {
    await pool.query(`ALTER TABLE pedidos ADD COLUMN ${nombre} ${definicion}`);
    console.log(`Columna "${nombre}" agregada.`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log(`Columna "${nombre}" ya existía, no se hizo nada.`);
    } else {
      throw err;
    }
  }
}

await agregarColumna('lat', 'DECIMAL(10,7) NULL AFTER direccion_entrega');
await agregarColumna('lng', 'DECIMAL(10,7) NULL AFTER lat');

console.log('Listo.');
process.exit(0);