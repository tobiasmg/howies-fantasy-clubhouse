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

// Get tournament leaderboard - NEW ENDPOINT
router.get('/:id/leaderboard', async (req, res) => {
    try {
        const tournamentId = req.params.id;
        
        const leaderboard = await query(`
            SELECT 
                t.id as team_id,
                t.team_name,
                t.total_score,
                u.username,
                u.email,
                t.created_at,
                (CASE WHEN t.golfer1_id IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN t.golfer2_id IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN t.golfer3_id IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN t.golfer4_id IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN t.golfer5_id IS NOT NULL THEN 1 ELSE 0 END +
                 CASE WHEN t.golfer6_id IS NOT NULL THEN 1 ELSE 0 END) as golfer_count
            FROM teams t
            JOIN users u ON t.user_id = u.id
            WHERE t.tournament_id = $1
            ORDER BY t.total_score ASC, t.created_at ASC
        `, [tournamentId]);
        
        res.json(leaderboard.rows);
    } catch (error) {
        console.error('Error loading tournament leaderboard:', error);
        res.status(500).json({ error: 'Failed to load tournament leaderboard' });
    }
});

module.exports = router;
