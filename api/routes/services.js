// Services Routes - Get available service types
const express = require('express');
const router = express.Router();

// Get all service types
router.get('/types', async (req, res) => {
    const db = req.app.locals.db;

    try {
        const result = await db.query(`
            SELECT id, name, description, icon
            FROM service_types
            WHERE is_active = TRUE
            ORDER BY name
        `);

        res.json({ services: result.rows });

    } catch (error) {
        console.error('Get service types error:', error);
        res.status(500).json({ error: { message: 'Failed to get services' } });
    }
});

// Get popular services (most offered by therapists)
router.get('/popular', async (req, res) => {
    const db = req.app.locals.db;
    const { limit = 10 } = req.query;

    try {
        const result = await db.query(`
            SELECT st.id, st.name, st.description, st.icon, COUNT(ts.id) as therapist_count
            FROM service_types st
            LEFT JOIN therapist_services ts ON st.id = ts.service_type_id AND ts.is_active = TRUE
            WHERE st.is_active = TRUE
            GROUP BY st.id
            ORDER BY therapist_count DESC
            LIMIT $1
        `, [parseInt(limit)]);

        res.json({ services: result.rows });

    } catch (error) {
        console.error('Get popular services error:', error);
        res.status(500).json({ error: { message: 'Failed to get services' } });
    }
});

// Get average prices for a service type
router.get('/prices/:serviceTypeId', async (req, res) => {
    const db = req.app.locals.db;
    const { serviceTypeId } = req.params;
    const { zip, radius = 25 } = req.query;

    try {
        let query = `
            SELECT 
                ts.duration_minutes,
                MIN(ts.price) as min_price,
                MAX(ts.price) as max_price,
                AVG(ts.price) as avg_price,
                COUNT(*) as count
            FROM therapist_services ts
            JOIN therapists t ON ts.therapist_id = t.id
            WHERE ts.service_type_id = $1 
              AND ts.is_active = TRUE
              AND t.is_active = TRUE
        `;
        const params = [serviceTypeId];

        // Filter by location if provided
        if (zip) {
            const zipResult = await db.query(
                'SELECT latitude, longitude FROM zip_codes WHERE zip = $1',
                [zip]
            );
            if (zipResult.rows.length > 0) {
                const { latitude, longitude } = zipResult.rows[0];
                query += `
                    AND earth_distance(ll_to_earth($2, $3), ll_to_earth(t.latitude, t.longitude)) <= $4 * 1609.344
                `;
                params.push(latitude, longitude, parseInt(radius));
            }
        }

        query += ` GROUP BY ts.duration_minutes ORDER BY ts.duration_minutes`;

        const result = await db.query(query, params);

        res.json({
            prices: result.rows.map(row => ({
                durationMinutes: row.duration_minutes,
                minPrice: parseFloat(row.min_price),
                maxPrice: parseFloat(row.max_price),
                avgPrice: Math.round(parseFloat(row.avg_price)),
                count: parseInt(row.count)
            }))
        });

    } catch (error) {
        console.error('Get prices error:', error);
        res.status(500).json({ error: { message: 'Failed to get prices' } });
    }
});

module.exports = router;
