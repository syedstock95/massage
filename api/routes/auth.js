// Auth Routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES = '7d';

// Register
router.post('/register', async (req, res) => {
    const db = req.app.locals.db;
    const { email, password, firstName, lastName, phone, role = 'consumer' } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: { message: 'Email and password required' } });
        }

        // Check if email exists
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: { message: 'Email already registered' } });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Create user
        const result = await db.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, first_name, last_name, role, created_at`,
            [email.toLowerCase(), passwordHash, firstName, lastName, phone, role]
        );

        const user = result.rows[0];

        // If registering as therapist, create therapist profile
        if (role === 'therapist') {
            await db.query(
                `INSERT INTO therapists (user_id) VALUES ($1)`,
                [user.id]
            );
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            },
            token
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: { message: 'Registration failed' } });
    }
});

// Login
router.post('/login', async (req, res) => {
    const db = req.app.locals.db;
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: { message: 'Email and password required' } });
        }

        // Find user
        const result = await db.query(
            'SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: { message: 'Invalid credentials' } });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: { message: 'Invalid credentials' } });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        // Get therapist profile if applicable
        let therapistId = null;
        if (user.role === 'therapist') {
            const therapistResult = await db.query(
                'SELECT id FROM therapists WHERE user_id = $1',
                [user.id]
            );
            if (therapistResult.rows.length > 0) {
                therapistId = therapistResult.rows[0].id;
            }
        }

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                therapistId
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: { message: 'Login failed' } });
    }
});

// Verify token / Get current user
router.get('/me', async (req, res) => {
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const result = await db.query(
            'SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: { message: 'User not found' } });
        }

        const user = result.rows[0];

        // Get therapist profile if applicable
        let therapist = null;
        if (user.role === 'therapist') {
            const therapistResult = await db.query(
                'SELECT * FROM therapists WHERE user_id = $1',
                [user.id]
            );
            if (therapistResult.rows.length > 0) {
                therapist = therapistResult.rows[0];
            }
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                phone: user.phone,
                role: user.role
            },
            therapist
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: { message: 'Invalid or expired token' } });
        }
        console.error('Auth check error:', error);
        res.status(500).json({ error: { message: 'Authentication failed' } });
    }
});

module.exports = router;
