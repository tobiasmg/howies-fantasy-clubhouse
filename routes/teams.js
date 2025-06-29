const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's teams
router.get('/my-teams', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT t.*, tour.name as tournament_name, tour.start_date, tour.end_date
            FROM teams t
            JOIN tournaments tour ON t.tournament_id = tour.id
            WHERE t.user_id = $1
            ORDER BY tour.start_date DESC
        `, [req.user.userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get user teams error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create or update team
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { tournamentId, teamName, golferIds } = req.body;
        
        if (!tournamentId || !golferIds || golferIds.length !== 6) {
            return res.status(400).json({ error: 'Tournament ID and 6 golfer IDs required' });
        }
        
        // Check if tournament has started
        const tournamentResult = await query(
            'SELECT start_date FROM tournaments WHERE id = $1',
            [tournamentId]
        );
        
        if (tournamentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        
        const startDate = new Date(tournamentResult.rows[0].start_date);
        if (startDate <= new Date()) {
            return res.status(400).json({ error: 'Cannot modify team - tournament has started' });
        }
        
        // Insert or update team
        const result = await query(`
            INSERT INTO teams (user_id, tournament_id, team_name, golfer1_id, golfer2_id, golfer3_id, golfer4_id, golfer5_id, golfer6_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (user_id, tournament_id) DO UPDATE SET
                team_name = EXCLUDED.team_name,
                golfer1_id = EXCLUDED.golfer1_id,
                golfer2_id = EXCLUDED.golfer2_id,
                golfer3_id = EXCLUDED.golfer3_id,
                golfer4_id = EXCLUDED.golfer4_id,
                golfer5_id = EXCLUDED.golfer5_id,
                golfer6_id = EXCLUDED.golfer6_id,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [req.user.userId, tournamentId, teamName, ...golferIds]);
        
        res.json({ message: 'Team saved successfully', team: result.rows[0] });
    } catch (error) {
        console.error('Create team error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

