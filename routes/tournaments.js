const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Get all tournaments
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT t.*, COUNT(teams.id) as team_count
            FROM tournaments t
            LEFT JOIN teams ON t.id = teams.tournament_id
            GROUP BY t.id
            ORDER BY t.start_date DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get tournaments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get tournament by ID
router.get('/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get tournament error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
