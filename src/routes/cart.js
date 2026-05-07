const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { getHexagon, getStoreByHexagon } = require('../utils/h3Helper');

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/cart/validate
// Request body: { lat, lng, items: [{ product_id, quantity }] }
router.post('/validate', async (req, res) => {
    const { lat, lng, items } = req.body;
    if (!lat || !lng || !items || !items.length) {
        return res.status(400).json({ error: 'Missing lat, lng, or items' });
    }

    try {
        // 1. Get hexagon index
        const hex = getHexagon(lat, lng, 9);
        // 2. Find store for that hexagon
        const storeId = await getStoreByHexagon(hex, pool);
        if (!storeId) {
            return res.status(404).json({ error: 'No store serves this location' });
        }

        // 3. Check inventory for all items at that store
        const productIds = items.map(i => i.product_id);
        const inventoryQuery = `
            SELECT product_id, quantity
            FROM inventory
            WHERE store_id = $1 AND product_id = ANY($2::int[])
        `;
        const invRes = await pool.query(inventoryQuery, [storeId, productIds]);

        // Build a map of product_id -> available quantity
        const stockMap = {};
        invRes.rows.forEach(row => {
            stockMap[row.product_id] = row.quantity;
        });

        // Validate each requested item
        const unavailable = [];
        for (const item of items) {
            const availableQty = stockMap[item.product_id] || 0;
            if (availableQty < item.quantity) {
                unavailable.push({ product_id: item.product_id, requested: item.quantity, available: availableQty });
            }
        }

        if (unavailable.length > 0) {
            return res.status(400).json({
                error: 'Insufficient stock at your local store',
                unavailable
            });
        }

        // 4. All items can be fulfilled by this single store
        res.json({ success: true, store_id: storeId, message: 'All items available' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;