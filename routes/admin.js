const express = require('express');
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require admin
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM tournaments) as total_tournaments,
                (SELECT COUNT(*) FROM teams) as total_teams,
                (SELECT COUNT(*) FROM golfers WHERE is_active = true) as active_golfers
        `);
        
        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

