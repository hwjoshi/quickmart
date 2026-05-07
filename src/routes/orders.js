const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { getHexagon, getStoreByHexagon } = require('../utils/h3Helper');

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/orders
// Request body: { customer_name, customer_phone, delivery_address, lat, lng, items: [{ product_id, quantity }] }
router.post('/', async (req, res) => {
    const { customer_name, customer_phone, delivery_address, lat, lng, items } = req.body;
    if (!customer_name || !customer_phone || !delivery_address || !lat || !lng || !items || !items.length) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 1. Determine store from location
        const hex = getHexagon(lat, lng, 9);
        const storeId = await getStoreByHexagon(hex, pool);
        if (!storeId) {
            return res.status(404).json({ error: 'No store serves this location' });
        }

        // 2. Check inventory again (to avoid race condition)
        const productIds = items.map(i => i.product_id);
        const invRes = await pool.query(`
            SELECT product_id, quantity FROM inventory
            WHERE store_id = $1 AND product_id = ANY($2::int[])
        `, [storeId, productIds]);
        const stockMap = {};
        invRes.rows.forEach(row => { stockMap[row.product_id] = row.quantity; });

        for (const item of items) {
            const available = stockMap[item.product_id] || 0;
            if (available < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
            }
        }

        // 3. Calculate total amount (you can fetch product prices from DB; here we assume price lookup)
        // For simplicity, we'll query product prices
        const priceRes = await pool.query(`
            SELECT id, price FROM products WHERE id = ANY($1::int[])
        `, [productIds]);
        const priceMap = {};
        priceRes.rows.forEach(row => { priceMap[row.id] = parseFloat(row.price); });
        let total = 0;
        for (const item of items) {
            total += (priceMap[item.product_id] || 0) * item.quantity;
        }

        // 4. Create order
        const orderRes = await pool.query(`
            INSERT INTO orders (customer_name, customer_phone, delivery_address, lat, lng, store_id, total_amount, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING id
        `, [customer_name, customer_phone, delivery_address, lat, lng, storeId, total]);
        const orderId = orderRes.rows[0].id;

        // 5. Reduce inventory (optional – you may want to reserve stock)
        for (const item of items) {
            await pool.query(`
                UPDATE inventory SET quantity = quantity - $1
                WHERE store_id = $2 AND product_id = $3
            `, [item.quantity, storeId, item.product_id]);
        }

        // 6. Return order details
        res.json({ success: true, order_id: orderId, store_id: storeId, total_amount: total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;