const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Get all golfers
router.get('/', async (req, res) => {
    try {
        const { search, limit = 50, offset = 0 } = req.query;
        
        let whereClause = 'WHERE is_active = true';
        let queryParams = [];
        
        if (search) {
            whereClause += ' AND name ILIKE $1';
            queryParams.push(`%${search}%`);
        }
        
        queryParams.push(limit, offset);
        
        const result = await query(`
            SELECT * FROM golfers 
            ${whereClause}
            ORDER BY world_ranking ASC 
            LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
        `, queryParams);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get golfers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

