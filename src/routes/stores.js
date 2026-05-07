const express = require('express');
const router = express.Router();

// Temporary in-memory store (will be replaced with DB)
let stores = [
  { id: 1, name: 'Faridabad Dark Store', lat: 28.4089, lng: 77.3178, zones: [] }
];

router.get('/', (req, res) => {
  res.json(stores);
});

router.post('/seed', (req, res) => {
  // Placeholder for seeding stores
  res.json({ message: 'Seeding not implemented yet' });
});

module.exports = router;