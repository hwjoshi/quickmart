const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS zones (
      id SERIAL PRIMARY KEY,
      h3_index VARCHAR(15) UNIQUE NOT NULL,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      image_url TEXT,
      is_available BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(store_id, product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(20),
      delivery_address TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      store_id INTEGER REFERENCES stores(id),
      status VARCHAR(50) DEFAULT 'pending',
      total_amount DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_partners (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      phone VARCHAR(20) UNIQUE,
      is_available BOOLEAN DEFAULT true,
      current_lat DOUBLE PRECISION,
      current_lng DOUBLE PRECISION,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS order_assignments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id),
      partner_id INTEGER REFERENCES delivery_partners(id),
      assigned_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(50) DEFAULT 'assigned'
    )`
  ];

  for (let query of queries) {
    try {
      await pool.query(query);
      console.log('Table created/verified');
    } catch (err) {
      console.error('Error creating table:', err.message);
    }
  }
  await pool.end();
};

createTables();