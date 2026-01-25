// Therapist Routes
const express = require('express');
const router = express.Router();
const { authMiddleware, therapistOnly } = require('../middleware/auth');

// Get therapist profile by ID (public)
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;

    try {
        // Get therapist profile
        const result = await db.query(`
            SELECT 
                t.*,
                u.first_name,
                u.last_name,
                u.email
            FROM therapists t
            JOIN users u ON t.user_id = u.id
            WHERE t.id = $1 AND t.is_active = TRUE
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapist = result.rows[0];

        // Increment view count
        await db.query('UPDATE therapists SET view_count = view_count + 1 WHERE id = $1', [id]);

        // Get services
        const servicesResult = await db.query(`
            SELECT ts.id, st.name, st.icon, ts.duration_minutes, ts.price, ts.description
            FROM therapist_services ts
            JOIN service_types st ON ts.service_type_id = st.id
            WHERE ts.therapist_id = $1 AND ts.is_active = TRUE
            ORDER BY ts.price ASC
        `, [id]);

        // Get availability
        const availabilityResult = await db.query(`
            SELECT day_of_week, start_time, end_time
            FROM therapist_availability
            WHERE therapist_id = $1 AND is_active = TRUE
            ORDER BY day_of_week, start_time
        `, [id]);

        // Get reviews
        const reviewsResult = await db.query(`
            SELECT r.id, r.rating, r.title, r.comment, r.created_at, r.therapist_response,
                   u.first_name, u.last_name
            FROM reviews r
            LEFT JOIN users u ON r.consumer_id = u.id
            WHERE r.therapist_id = $1 AND r.is_visible = TRUE
            ORDER BY r.created_at DESC
            LIMIT 10
        `, [id]);

        // Get gallery images
        const imagesResult = await db.query(`
            SELECT id, image_url, caption
            FROM therapist_images
            WHERE therapist_id = $1
            ORDER BY display_order
        `, [id]);

        // Hide sensitive data for non-pro listings
        const publicProfile = {
            id: therapist.id,
            businessName: therapist.business_name,
            firstName: therapist.first_name,
            lastName: therapist.last_name,
            bio: therapist.bio,
            profileImage: therapist.profile_image,
            city: therapist.city,
            state: therapist.state,
            zip: therapist.zip,
            yearsExperience: therapist.years_experience,
            licenseNumber: therapist.license_number,
            licenseState: therapist.license_state,
            acceptsNewClients: therapist.accepts_new_clients,
            offersMobile: therapist.offers_mobile,
            ratingAverage: parseFloat(therapist.rating_average) || 0,
            ratingCount: therapist.rating_count,
            isVerified: therapist.is_verified,
            subscriptionTier: therapist.subscription_tier,
            services: servicesResult.rows,
            availability: availabilityResult.rows,
            reviews: reviewsResult.rows,
            images: imagesResult.rows
        };

        // Show contact info based on subscription
        if (therapist.subscription_tier !== 'free') {
            publicProfile.phone = therapist.phone;
            publicProfile.website = therapist.website;
            publicProfile.email = therapist.email;
        }

        res.json({ therapist: publicProfile });

    } catch (error) {
        console.error('Get therapist error:', error);
        res.status(500).json({ error: { message: 'Failed to get therapist' } });
    }
});

// Update therapist profile (authenticated)
router.put('/profile', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const {
        businessName,
        bio,
        profileImage,
        licenseNumber,
        licenseState,
        yearsExperience,
        addressLine1,
        addressLine2,
        city,
        state,
        zip,
        phone,
        website,
        acceptsNewClients,
        offersMobile,
        serviceRadiusMiles
    } = req.body;

    try {
        // Get coordinates from zip code
        let latitude = null, longitude = null;
        if (zip) {
            const zipResult = await db.query(
                'SELECT latitude, longitude FROM zip_codes WHERE zip = $1',
                [zip]
            );
            if (zipResult.rows.length > 0) {
                latitude = zipResult.rows[0].latitude;
                longitude = zipResult.rows[0].longitude;
            }
        }

        const result = await db.query(`
            UPDATE therapists SET
                business_name = COALESCE($1, business_name),
                bio = COALESCE($2, bio),
                profile_image = COALESCE($3, profile_image),
                license_number = COALESCE($4, license_number),
                license_state = COALESCE($5, license_state),
                years_experience = COALESCE($6, years_experience),
                address_line1 = COALESCE($7, address_line1),
                address_line2 = COALESCE($8, address_line2),
                city = COALESCE($9, city),
                state = COALESCE($10, state),
                zip = COALESCE($11, zip),
                latitude = COALESCE($12, latitude),
                longitude = COALESCE($13, longitude),
                phone = COALESCE($14, phone),
                website = COALESCE($15, website),
                accepts_new_clients = COALESCE($16, accepts_new_clients),
                offers_mobile = COALESCE($17, offers_mobile),
                service_radius_miles = COALESCE($18, service_radius_miles),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $19
            RETURNING *
        `, [
            businessName, bio, profileImage, licenseNumber, licenseState,
            yearsExperience, addressLine1, addressLine2, city, state, zip,
            latitude, longitude, phone, website, acceptsNewClients,
            offersMobile, serviceRadiusMiles, userId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist profile not found' } });
        }

        res.json({ 
            message: 'Profile updated',
            therapist: result.rows[0]
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: { message: 'Failed to update profile' } });
    }
});

// Add/Update service
router.post('/services', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { serviceTypeId, durationMinutes, price, description } = req.body;

    try {
        // Get therapist ID
        const therapistResult = await db.query(
            'SELECT id, subscription_tier FROM therapists WHERE user_id = $1',
            [userId]
        );
        
        if (therapistResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapist = therapistResult.rows[0];

        // Check service limit based on subscription
        const countResult = await db.query(
            'SELECT COUNT(*) as count FROM therapist_services WHERE therapist_id = $1',
            [therapist.id]
        );
        const serviceCount = parseInt(countResult.rows[0].count);

        const limits = { free: 3, pro: 10, premium: 999 };
        if (serviceCount >= limits[therapist.subscription_tier]) {
            return res.status(400).json({ 
                error: { message: `Free tier limited to ${limits.free} services. Upgrade to Pro for more.` }
            });
        }

        // Insert or update service
        const result = await db.query(`
            INSERT INTO therapist_services (therapist_id, service_type_id, duration_minutes, price, description)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (therapist_id, service_type_id, duration_minutes)
            DO UPDATE SET price = $4, description = $5, is_active = TRUE
            RETURNING *
        `, [therapist.id, serviceTypeId, durationMinutes, price, description]);

        res.json({
            message: 'Service added',
            service: result.rows[0]
        });

    } catch (error) {
        console.error('Add service error:', error);
        res.status(500).json({ error: { message: 'Failed to add service' } });
    }
});

// Delete service
router.delete('/services/:serviceId', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { serviceId } = req.params;

    try {
        const result = await db.query(`
            UPDATE therapist_services ts SET is_active = FALSE
            FROM therapists t
            WHERE ts.id = $1 
              AND ts.therapist_id = t.id 
              AND t.user_id = $2
            RETURNING ts.id
        `, [serviceId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Service not found' } });
        }

        res.json({ message: 'Service removed' });

    } catch (error) {
        console.error('Delete service error:', error);
        res.status(500).json({ error: { message: 'Failed to delete service' } });
    }
});

// Set availability
router.post('/availability', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { availability } = req.body; // Array of { dayOfWeek, startTime, endTime }

    try {
        // Get therapist ID
        const therapistResult = await db.query(
            'SELECT id FROM therapists WHERE user_id = $1',
            [userId]
        );
        
        if (therapistResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapistId = therapistResult.rows[0].id;

        // Clear existing availability
        await db.query('DELETE FROM therapist_availability WHERE therapist_id = $1', [therapistId]);

        // Insert new availability
        for (const slot of availability) {
            await db.query(`
                INSERT INTO therapist_availability (therapist_id, day_of_week, start_time, end_time)
                VALUES ($1, $2, $3, $4)
            `, [therapistId, slot.dayOfWeek, slot.startTime, slot.endTime]);
        }

        res.json({ message: 'Availability updated' });

    } catch (error) {
        console.error('Set availability error:', error);
        res.status(500).json({ error: { message: 'Failed to set availability' } });
    }
});

// Get dashboard stats (for therapist)
router.get('/dashboard/stats', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;

    try {
        const therapistResult = await db.query(
            'SELECT id, view_count, booking_count, rating_average, rating_count FROM therapists WHERE user_id = $1',
            [userId]
        );

        if (therapistResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapist = therapistResult.rows[0];

        // Get recent bookings
        const bookingsResult = await db.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                   COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
                   COUNT(CASE WHEN booking_date >= CURRENT_DATE THEN 1 END) as upcoming
            FROM bookings
            WHERE therapist_id = $1
        `, [therapist.id]);

        // Get this month's revenue
        const revenueResult = await db.query(`
            SELECT COALESCE(SUM(price), 0) as revenue
            FROM bookings
            WHERE therapist_id = $1
              AND status = 'completed'
              AND booking_date >= DATE_TRUNC('month', CURRENT_DATE)
        `, [therapist.id]);

        res.json({
            stats: {
                views: therapist.view_count,
                totalBookings: therapist.booking_count,
                rating: parseFloat(therapist.rating_average) || 0,
                reviewCount: therapist.rating_count,
                bookings: bookingsResult.rows[0],
                monthlyRevenue: parseFloat(revenueResult.rows[0].revenue) || 0
            }
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: { message: 'Failed to get stats' } });
    }
});

module.exports = router;
