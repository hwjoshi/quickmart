const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const h3 = require('h3-js');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Database connection from environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src/public'));

// Helper functions
function getHexagon(lat, lng, resolution = 9) {
    return h3.latLngToCell(lat, lng, resolution);
}

async function getStoreByHexagon(hexIndex) {
    const res = await pool.query(
        'SELECT store_id FROM zones WHERE h3_index = $1',
        [hexIndex]
    );
    return res.rows[0]?.store_id || null;
}

// Socket.io real-time tracking
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('driver:join', (orderId) => {
        socket.join(`order_${orderId}`);
        console.log(`Driver joined room for order ${orderId}`);
    });
    socket.on('driver:location', ({ orderId, lat, lng }) => {
        io.to(`order_${orderId}`).emit('driver:location', { orderId, lat, lng });
    });
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Cart validation
app.post('/api/cart/validate', async (req, res) => {
    const { lat, lng, items } = req.body;
    if (!lat || !lng || !items || !items.length) {
        return res.status(400).json({ error: 'Missing lat, lng, or items' });
    }
    try {
        const hex = getHexagon(lat, lng, 9);
        const storeId = await getStoreByHexagon(hex);
        if (!storeId) {
            return res.status(404).json({ error: 'No store serves this location' });
        }
        const productIds = items.map(i => i.product_id);
        const invRes = await pool.query(`
            SELECT product_id, quantity FROM inventory
            WHERE store_id = $1 AND product_id = ANY($2::int[])
        `, [storeId, productIds]);
        const stockMap = {};
        invRes.rows.forEach(row => { stockMap[row.product_id] = row.quantity; });
        const unavailable = [];
        for (const item of items) {
            const available = stockMap[item.product_id] || 0;
            if (available < item.quantity) {
                unavailable.push({ product_id: item.product_id, requested: item.quantity, available });
            }
        }
        if (unavailable.length) {
            return res.status(400).json({ error: 'Insufficient stock at your local store', unavailable });
        }
        res.json({ success: true, store_id: storeId, message: 'All items available' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order creation
app.post('/api/orders', async (req, res) => {
    const { customer_name, customer_phone, delivery_address, lat, lng, items } = req.body;
    if (!customer_name || !customer_phone || !delivery_address || !lat || !lng || !items || !items.length) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const hex = getHexagon(lat, lng, 9);
        const storeId = await getStoreByHexagon(hex);
        if (!storeId) {
            return res.status(404).json({ error: 'No store serves this location' });
        }
        // Check inventory again
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
        // Get prices
        const priceRes = await pool.query(`
            SELECT id, price FROM products WHERE id = ANY($1::int[])
        `, [productIds]);
        const priceMap = {};
        priceRes.rows.forEach(row => { priceMap[row.id] = parseFloat(row.price); });
        let total = 0;
        for (const item of items) {
            total += (priceMap[item.product_id] || 0) * item.quantity;
        }
        const orderRes = await pool.query(`
            INSERT INTO orders (customer_name, customer_phone, delivery_address, lat, lng, store_id, total_amount, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING id
        `, [customer_name, customer_phone, delivery_address, lat, lng, storeId, total]);
        const orderId = orderRes.rows[0].id;
        // Deduct inventory
        for (const item of items) {
            await pool.query(`
                UPDATE inventory SET quantity = quantity - $1
                WHERE store_id = $2 AND product_id = $3
            `, [item.quantity, storeId, item.product_id]);
        }
        res.json({ success: true, order_id: orderId, store_id: storeId, total_amount: total });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});