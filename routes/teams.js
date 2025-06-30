const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's teams with golfer details
router.get('/my-teams', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                t.id,
                t.team_name,
                t.total_score,
                t.created_at,
                t.updated_at,
                tour.id as tournament_id,
                tour.name as tournament_name, 
                tour.start_date, 
                tour.end_date,
                tour.is_active,
                g1.id as golfer1_id, g1.name as golfer1_name, g1.country as golfer1_country, g1.world_ranking as golfer1_ranking,
                g2.id as golfer2_id, g2.name as golfer2_name, g2.country as golfer2_country, g2.world_ranking as golfer2_ranking,
                g3.id as golfer3_id, g3.name as golfer3_name, g3.country as golfer3_country, g3.world_ranking as golfer3_ranking,
                g4.id as golfer4_id, g4.name as golfer4_name, g4.country as golfer4_country, g4.world_ranking as golfer4_ranking,
                g5.id as golfer5_id, g5.name as golfer5_name, g5.country as golfer5_country, g5.world_ranking as golfer5_ranking,
                g6.id as golfer6_id, g6.name as golfer6_name, g6.country as golfer6_country, g6.world_ranking as golfer6_ranking
            FROM teams t
            JOIN tournaments tour ON t.tournament_id = tour.id
            LEFT JOIN golfers g1 ON t.golfer1_id = g1.id
            LEFT JOIN golfers g2 ON t.golfer2_id = g2.id
            LEFT JOIN golfers g3 ON t.golfer3_id = g3.id
            LEFT JOIN golfers g4 ON t.golfer4_id = g4.id
            LEFT JOIN golfers g5 ON t.golfer5_id = g5.id
            LEFT JOIN golfers g6 ON t.golfer6_id = g6.id
            WHERE t.user_id = $1
            ORDER BY tour.start_date DESC
        `, [req.user.userId]);
        
        // Transform the data to include golfers array
        const teams = result.rows.map(row => {
            const golfers = [];
            for (let i = 1; i <= 6; i++) {
                if (row[`golfer${i}_id`]) {
                    golfers.push({
                        id: row[`golfer${i}_id`],
                        name: row[`golfer${i}_name`],
                        country: row[`golfer${i}_country`],
                        world_ranking: row[`golfer${i}_ranking`]
                    });
                }
            }
            
            return {
                id: row.id,
                team_name: row.team_name,
                total_score: row.total_score,
                created_at: row.created_at,
                updated_at: row.updated_at,
                tournament_id: row.tournament_id,
                tournament_name: row.tournament_name,
                start_date: row.start_date,
                end_date: row.end_date,
                is_active: row.is_active,
                golfers: golfers,
                can_edit: new Date(row.start_date) > new Date() // Can edit if tournament hasn't started
            };
        });
        
        res.json(teams);
    } catch (error) {
        console.error('Get user teams error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get specific team details (for editing)
router.get('/:teamId', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                t.*,
                tour.name as tournament_name,
                tour.start_date,
                tour.end_date
            FROM teams t
            JOIN tournaments tour ON t.tournament_id = tour.id
            WHERE t.id = $1 AND t.user_id = $2
        `, [req.params.teamId, req.user.userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        const team = result.rows[0];
        
        // Check if tournament has started
        if (new Date(team.start_date) <= new Date()) {
            return res.status(400).json({ error: 'Cannot edit team - tournament has started' });
        }
        
        res.json(team);
    } catch (error) {
        console.error('Get team error:', error);
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
        
        if (!teamName || !teamName.trim()) {
            return res.status(400).json({ error: 'Team name is required' });
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
        
        // Check if team already exists
        const existingTeam = await query(
            'SELECT id, team_name FROM teams WHERE user_id = $1 AND tournament_id = $2',
            [req.user.userId, tournamentId]
        );
        
        const isUpdate = existingTeam.rows.length > 0;
        
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
        `, [req.user.userId, tournamentId, teamName.trim(), ...golferIds]);
        
        const message = isUpdate 
            ? 'Team updated successfully' 
            : 'Team created successfully';
            
        res.json({ message, team: result.rows[0], isUpdate });
    } catch (error) {
        console.error('Create team error:', error);
        if (error.code === '23505') { // Unique constraint violation
            res.status(400).json({ error: 'You already have a team for this tournament' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Check if user has team for tournament
router.get('/check/:tournamentId', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                t.id,
                t.team_name,
                tour.name as tournament_name,
                tour.start_date
            FROM teams t
            JOIN tournaments tour ON t.tournament_id = tour.id
            WHERE t.user_id = $1 AND t.tournament_id = $2
        `, [req.user.userId, req.params.tournamentId]);
        
        if (result.rows.length > 0) {
            const team = result.rows[0];
            res.json({ 
                hasTeam: true, 
                team: team,
                canEdit: new Date(team.start_date) > new Date()
            });
        } else {
            res.json({ hasTeam: false });
        }
    } catch (error) {
        console.error('Check team error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
