const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const result = await query(
            'SELECT id, email, username, is_admin FROM users WHERE id = $1',
            [decoded.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            username: decoded.username,
            isAdmin: result.rows[0].is_admin
        };
        
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    next();
};

module.exports = { authenticateToken, requireAdmin };
