const h3 = require('h3-js');

/**
 * Convert latitude and longitude to an H3 hexagon index.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} resolution - H3 resolution (default 9)
 * @returns {string} H3 index
 */
function getHexagon(lat, lng, resolution = 9) {
    return h3.latLngToCell(lat, lng, resolution);
}

/**
 * Get the store ID that serves a given H3 hexagon.
 * @param {string} hexIndex - H3 index
 * @returns {Promise<number|null>} Store ID or null if not found
 */
async function getStoreByHexagon(hexIndex, pool) {
    const res = await pool.query(
        'SELECT store_id FROM zones WHERE h3_index = $1',
        [hexIndex]
    );
    if (res.rows.length > 0) {
        return res.rows[0].store_id;
    }
    return null;
}

module.exports = { getHexagon, getStoreByHexagon }; 
