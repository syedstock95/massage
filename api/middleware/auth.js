// Auth Middleware
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Require authentication
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: { message: 'Token expired' } });
        }
        return res.status(401).json({ error: { message: 'Invalid token' } });
    }
};

// Optional authentication (user info available if logged in)
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (error) {
        req.user = null;
    }
    next();
};

// Require therapist role
const therapistOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    if (req.user.role !== 'therapist' && req.user.role !== 'admin') {
        return res.status(403).json({ error: { message: 'Therapist access required' } });
    }

    next();
};

// Require admin role
const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    next();
};

module.exports = {
    authMiddleware,
    optionalAuth,
    therapistOnly,
    adminOnly
};
