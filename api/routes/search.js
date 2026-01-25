// Search Routes - Core zip code search functionality
const express = require('express');
const router = express.Router();

// Search therapists by zip code with radius
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const {
        zip,
        city,
        state,
        radius = 25, // miles
        service,
        minRating,
        priceMin,
        priceMax,
        acceptsNew,
        offersMobile,
        sortBy = 'distance',
        page = 1,
        limit = 20
    } = req.query;

    try {
        let lat, lng;
        const offset = (page - 1) * limit;

        // Get coordinates from zip code or city
        if (zip) {
            const zipResult = await db.query(
                'SELECT latitude, longitude, city, state FROM zip_codes WHERE zip = $1',
                [zip]
            );
            if (zipResult.rows.length === 0) {
                return res.status(400).json({ error: { message: 'Invalid zip code' } });
            }
            lat = zipResult.rows[0].latitude;
            lng = zipResult.rows[0].longitude;
        } else if (city && state) {
            const cityResult = await db.query(
                'SELECT latitude, longitude FROM zip_codes WHERE LOWER(city) = LOWER($1) AND state = $2 LIMIT 1',
                [city, state.toUpperCase()]
            );
            if (cityResult.rows.length === 0) {
                return res.status(400).json({ error: { message: 'City not found' } });
            }
            lat = cityResult.rows[0].latitude;
            lng = cityResult.rows[0].longitude;
        } else {
            return res.status(400).json({ error: { message: 'Provide zip code or city/state' } });
        }

        // Build query with filters
        let query = `
            SELECT 
                t.id,
                t.business_name,
                t.bio,
                t.profile_image,
                t.city,
                t.state,
                t.zip,
                t.phone,
                t.website,
                t.accepts_new_clients,
                t.offers_mobile,
                t.subscription_tier,
                t.rating_average,
                t.rating_count,
                t.is_verified,
                t.years_experience,
                u.first_name,
                u.last_name,
                (earth_distance(
                    ll_to_earth($1, $2),
                    ll_to_earth(t.latitude, t.longitude)
                ) / 1609.344) AS distance_miles
            FROM therapists t
            JOIN users u ON t.user_id = u.id
            WHERE t.is_active = TRUE
              AND t.latitude IS NOT NULL
              AND earth_box(ll_to_earth($1, $2), $3 * 1609.344) @> ll_to_earth(t.latitude, t.longitude)
              AND earth_distance(ll_to_earth($1, $2), ll_to_earth(t.latitude, t.longitude)) <= $3 * 1609.344
        `;

        const params = [lat, lng, parseInt(radius)];
        let paramIndex = 4;

        // Add filters
        if (minRating) {
            query += ` AND t.rating_average >= $${paramIndex}`;
            params.push(parseFloat(minRating));
            paramIndex++;
        }

        if (acceptsNew === 'true') {
            query += ` AND t.accepts_new_clients = TRUE`;
        }

        if (offersMobile === 'true') {
            query += ` AND t.offers_mobile = TRUE`;
        }

        // Filter by service type
        if (service) {
            query += `
                AND EXISTS (
                    SELECT 1 FROM therapist_services ts
                    JOIN service_types st ON ts.service_type_id = st.id
                    WHERE ts.therapist_id = t.id
                      AND ts.is_active = TRUE
                      AND LOWER(st.name) LIKE LOWER($${paramIndex})
                )
            `;
            params.push(`%${service}%`);
            paramIndex++;
        }

        // Price filter (on any service)
        if (priceMin || priceMax) {
            query += `
                AND EXISTS (
                    SELECT 1 FROM therapist_services ts
                    WHERE ts.therapist_id = t.id
                      AND ts.is_active = TRUE
            `;
            if (priceMin) {
                query += ` AND ts.price >= $${paramIndex}`;
                params.push(parseFloat(priceMin));
                paramIndex++;
            }
            if (priceMax) {
                query += ` AND ts.price <= $${paramIndex}`;
                params.push(parseFloat(priceMax));
                paramIndex++;
            }
            query += `)`;
        }

        // Sorting - premium/featured first, then by criteria
        query += ` ORDER BY 
            CASE t.subscription_tier 
                WHEN 'premium' THEN 0 
                WHEN 'pro' THEN 1 
                ELSE 2 
            END,
        `;

        switch (sortBy) {
            case 'rating':
                query += ` t.rating_average DESC, t.rating_count DESC,`;
                break;
            case 'reviews':
                query += ` t.rating_count DESC,`;
                break;
            case 'experience':
                query += ` t.years_experience DESC NULLS LAST,`;
                break;
            default: // distance
                break;
        }
        query += ` distance_miles ASC`;

        // Pagination
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(query, params);

        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(*) as total
            FROM therapists t
            WHERE t.is_active = TRUE
              AND t.latitude IS NOT NULL
              AND earth_box(ll_to_earth($1, $2), $3 * 1609.344) @> ll_to_earth(t.latitude, t.longitude)
              AND earth_distance(ll_to_earth($1, $2), ll_to_earth(t.latitude, t.longitude)) <= $3 * 1609.344
        `;
        const countResult = await db.query(countQuery, [lat, lng, parseInt(radius)]);
        const total = parseInt(countResult.rows[0].total);

        // Fetch services for each therapist
        const therapists = await Promise.all(result.rows.map(async (therapist) => {
            const servicesResult = await db.query(`
                SELECT st.name, ts.duration_minutes, ts.price
                FROM therapist_services ts
                JOIN service_types st ON ts.service_type_id = st.id
                WHERE ts.therapist_id = $1 AND ts.is_active = TRUE
                ORDER BY ts.price ASC
                LIMIT 5
            `, [therapist.id]);

            return {
                ...therapist,
                distance_miles: Math.round(therapist.distance_miles * 10) / 10,
                services: servicesResult.rows
            };
        }));

        res.json({
            therapists,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            },
            search: {
                zip,
                city,
                state,
                radius: parseInt(radius),
                coordinates: { lat, lng }
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: { message: 'Search failed' } });
    }
});

// Get zip code suggestions (autocomplete)
router.get('/zip-suggest', async (req, res) => {
    const db = req.app.locals.db;
    const { q } = req.query;

    if (!q || q.length < 2) {
        return res.json({ suggestions: [] });
    }

    try {
        let result;
        
        // Check if searching by zip or city
        if (/^\d+$/.test(q)) {
            // Searching by zip code
            result = await db.query(
                `SELECT zip, city, state 
                 FROM zip_codes 
                 WHERE zip LIKE $1 
                 ORDER BY zip 
                 LIMIT 10`,
                [q + '%']
            );
        } else {
            // Searching by city name
            result = await db.query(
                `SELECT DISTINCT city, state, MIN(zip) as zip
                 FROM zip_codes 
                 WHERE LOWER(city) LIKE LOWER($1)
                 GROUP BY city, state
                 ORDER BY city
                 LIMIT 10`,
                [q + '%']
            );
        }

        res.json({
            suggestions: result.rows.map(row => ({
                zip: row.zip,
                city: row.city,
                state: row.state,
                display: `${row.city}, ${row.state} ${row.zip}`
            }))
        });

    } catch (error) {
        console.error('Zip suggest error:', error);
        res.status(500).json({ error: { message: 'Suggestion failed' } });
    }
});

// Get nearby cities (for "also search in" feature)
router.get('/nearby-cities', async (req, res) => {
    const db = req.app.locals.db;
    const { zip, radius = 30 } = req.query;

    if (!zip) {
        return res.status(400).json({ error: { message: 'Zip code required' } });
    }

    try {
        // Get origin coordinates
        const zipResult = await db.query(
            'SELECT latitude, longitude FROM zip_codes WHERE zip = $1',
            [zip]
        );
        
        if (zipResult.rows.length === 0) {
            return res.status(400).json({ error: { message: 'Invalid zip code' } });
        }

        const { latitude, longitude } = zipResult.rows[0];

        // Find nearby cities
        const result = await db.query(`
            SELECT DISTINCT city, state, MIN(zip) as zip,
                   (earth_distance(ll_to_earth($1, $2), ll_to_earth(latitude, longitude)) / 1609.344) as distance
            FROM zip_codes
            WHERE earth_box(ll_to_earth($1, $2), $3 * 1609.344) @> ll_to_earth(latitude, longitude)
            GROUP BY city, state
            ORDER BY distance
            LIMIT 10
        `, [latitude, longitude, parseInt(radius)]);

        res.json({
            cities: result.rows.map(row => ({
                city: row.city,
                state: row.state,
                zip: row.zip,
                distance: Math.round(row.distance)
            }))
        });

    } catch (error) {
        console.error('Nearby cities error:', error);
        res.status(500).json({ error: { message: 'Failed to get nearby cities' } });
    }
});

module.exports = router;
