// Booking Routes
const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth, therapistOnly } = require('../middleware/auth');

// Create booking (can be guest or authenticated)
router.post('/', optionalAuth, async (req, res) => {
    const db = req.app.locals.db;
    const {
        therapistId,
        serviceId,
        bookingDate,
        startTime,
        consumerName,
        consumerEmail,
        consumerPhone,
        locationType = 'in_studio',
        locationAddress,
        notes
    } = req.body;

    try {
        // Validate required fields
        if (!therapistId || !serviceId || !bookingDate || !startTime) {
            return res.status(400).json({ 
                error: { message: 'Missing required fields: therapistId, serviceId, bookingDate, startTime' }
            });
        }

        // Get service details
        const serviceResult = await db.query(`
            SELECT ts.*, t.subscription_tier
            FROM therapist_services ts
            JOIN therapists t ON ts.therapist_id = t.id
            WHERE ts.id = $1 AND ts.therapist_id = $2
        `, [serviceId, therapistId]);

        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Service not found' } });
        }

        const service = serviceResult.rows[0];

        // Check if therapist accepts online bookings (pro+ only)
        if (service.subscription_tier === 'free') {
            return res.status(400).json({ 
                error: { message: 'This therapist does not accept online bookings. Please contact them directly.' }
            });
        }

        // Calculate end time
        const [hours, minutes] = startTime.split(':').map(Number);
        const endMinutes = hours * 60 + minutes + service.duration_minutes;
        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

        // Check for conflicts
        const conflictResult = await db.query(`
            SELECT id FROM bookings
            WHERE therapist_id = $1
              AND booking_date = $2
              AND status NOT IN ('cancelled')
              AND (
                (start_time <= $3 AND end_time > $3)
                OR (start_time < $4 AND end_time >= $4)
                OR (start_time >= $3 AND end_time <= $4)
              )
        `, [therapistId, bookingDate, startTime, endTime]);

        if (conflictResult.rows.length > 0) {
            return res.status(400).json({ error: { message: 'This time slot is no longer available' } });
        }

        // Create booking
        const result = await db.query(`
            INSERT INTO bookings (
                therapist_id, consumer_id, service_id,
                booking_date, start_time, end_time, duration_minutes, price,
                consumer_name, consumer_email, consumer_phone,
                location_type, location_address, notes, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
            RETURNING *
        `, [
            therapistId,
            req.user?.id || null,
            serviceId,
            bookingDate,
            startTime,
            endTime,
            service.duration_minutes,
            service.price,
            consumerName,
            consumerEmail,
            consumerPhone,
            locationType,
            locationAddress,
            notes
        ]);

        // Update therapist booking count
        await db.query(
            'UPDATE therapists SET booking_count = booking_count + 1 WHERE id = $1',
            [therapistId]
        );

        res.status(201).json({
            message: 'Booking request submitted',
            booking: result.rows[0]
        });

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ error: { message: 'Failed to create booking' } });
    }
});

// Get available time slots for a therapist on a date
router.get('/availability/:therapistId/:date', async (req, res) => {
    const db = req.app.locals.db;
    const { therapistId, date } = req.params;
    const { serviceId } = req.query;

    try {
        // Get day of week (0-6)
        const dayOfWeek = new Date(date).getDay();

        // Get therapist's availability for this day
        const availResult = await db.query(`
            SELECT start_time, end_time
            FROM therapist_availability
            WHERE therapist_id = $1 AND day_of_week = $2 AND is_active = TRUE
            ORDER BY start_time
        `, [therapistId, dayOfWeek]);

        if (availResult.rows.length === 0) {
            return res.json({ slots: [], message: 'Not available on this day' });
        }

        // Get service duration
        let duration = 60; // default
        if (serviceId) {
            const serviceResult = await db.query(
                'SELECT duration_minutes FROM therapist_services WHERE id = $1',
                [serviceId]
            );
            if (serviceResult.rows.length > 0) {
                duration = serviceResult.rows[0].duration_minutes;
            }
        }

        // Get existing bookings for this date
        const bookingsResult = await db.query(`
            SELECT start_time, end_time
            FROM bookings
            WHERE therapist_id = $1 AND booking_date = $2 AND status NOT IN ('cancelled')
        `, [therapistId, date]);

        const bookedSlots = bookingsResult.rows.map(b => ({
            start: b.start_time,
            end: b.end_time
        }));

        // Generate available slots
        const slots = [];
        for (const period of availResult.rows) {
            let current = timeToMinutes(period.start_time);
            const end = timeToMinutes(period.end_time);

            while (current + duration <= end) {
                const slotStart = minutesToTime(current);
                const slotEnd = minutesToTime(current + duration);

                // Check if slot conflicts with any booking
                const isBooked = bookedSlots.some(booked => {
                    const bookedStart = timeToMinutes(booked.start);
                    const bookedEnd = timeToMinutes(booked.end);
                    return (current < bookedEnd && current + duration > bookedStart);
                });

                if (!isBooked) {
                    slots.push({
                        startTime: slotStart,
                        endTime: slotEnd,
                        display: formatTime(slotStart)
                    });
                }

                current += 30; // 30-minute intervals
            }
        }

        res.json({ slots, date, therapistId });

    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ error: { message: 'Failed to get availability' } });
    }
});

// Get bookings for therapist
router.get('/therapist', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

    try {
        const therapistResult = await db.query(
            'SELECT id FROM therapists WHERE user_id = $1',
            [userId]
        );

        if (therapistResult.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Therapist not found' } });
        }

        const therapistId = therapistResult.rows[0].id;
        const offset = (page - 1) * limit;

        let query = `
            SELECT b.*, 
                   st.name as service_name,
                   u.first_name as consumer_first_name,
                   u.last_name as consumer_last_name
            FROM bookings b
            JOIN therapist_services ts ON b.service_id = ts.id
            JOIN service_types st ON ts.service_type_id = st.id
            LEFT JOIN users u ON b.consumer_id = u.id
            WHERE b.therapist_id = $1
        `;
        const params = [therapistId];
        let paramIndex = 2;

        if (status) {
            query += ` AND b.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (startDate) {
            query += ` AND b.booking_date >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND b.booking_date <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY b.booking_date DESC, b.start_time DESC`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(query, params);

        res.json({
            bookings: result.rows,
            pagination: { page: parseInt(page), limit: parseInt(limit) }
        });

    } catch (error) {
        console.error('Get therapist bookings error:', error);
        res.status(500).json({ error: { message: 'Failed to get bookings' } });
    }
});

// Update booking status (therapist)
router.patch('/:bookingId/status', authMiddleware, therapistOnly, async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.user.id;
    const { bookingId } = req.params;
    const { status } = req.body;

    const validStatuses = ['confirmed', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: { message: 'Invalid status' } });
    }

    try {
        const result = await db.query(`
            UPDATE bookings b SET status = $1, updated_at = CURRENT_TIMESTAMP
            FROM therapists t
            WHERE b.id = $2 
              AND b.therapist_id = t.id 
              AND t.user_id = $3
            RETURNING b.*
        `, [status, bookingId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'Booking not found' } });
        }

        res.json({
            message: 'Booking updated',
            booking: result.rows[0]
        });

    } catch (error) {
        console.error('Update booking error:', error);
        res.status(500).json({ error: { message: 'Failed to update booking' } });
    }
});

// Helper functions
function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function formatTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

module.exports = router;
