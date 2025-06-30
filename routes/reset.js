// routes/reset.js - Fixed to match your database connection pattern
const express = require('express');
const router = express.Router();
const { query } = require('../config/database'); // Use your database pattern

// Reset golfers to original 15 sample players
router.post('/golfers-only', async (req, res) => {
    try {
        console.log('🔄 Resetting golfers to original sample data...');
        
        await query('BEGIN');
        
        // Delete all golfers
        await query('DELETE FROM golfers');
        console.log('✅ Existing golfers deleted');
        
        // Insert original 15 sample golfers (matching your server.js data)
        const sampleGolfers = [
            { name: 'Scottie Scheffler', country: 'USA', ranking: 1, wins: 12, majors: 2 },
            { name: 'Jon Rahm', country: 'ESP', ranking: 2, wins: 9, majors: 2 },
            { name: 'Rory McIlroy', country: 'NIR', ranking: 3, wins: 23, majors: 4 },
            { name: 'Patrick Cantlay', country: 'USA', ranking: 4, wins: 8, majors: 0 },
            { name: 'Xander Schauffele', country: 'USA', ranking: 5, wins: 6, majors: 2 },
            { name: 'Viktor Hovland', country: 'NOR', ranking: 6, wins: 3, majors: 0 },
            { name: 'Collin Morikawa', country: 'USA', ranking: 7, wins: 6, majors: 2 },
            { name: 'Wyndham Clark', country: 'USA', ranking: 8, wins: 3, majors: 1 },
            { name: 'Justin Thomas', country: 'USA', ranking: 9, wins: 15, majors: 2 },
            { name: 'Jordan Spieth', country: 'USA', ranking: 10, wins: 13, majors: 3 },
            { name: 'Max Homa', country: 'USA', ranking: 11, wins: 6, majors: 0 },
            { name: 'Jason Day', country: 'AUS', ranking: 12, wins: 13, majors: 1 },
            { name: 'Brian Harman', country: 'USA', ranking: 13, wins: 2, majors: 1 },
            { name: 'Russell Henley', country: 'USA', ranking: 14, wins: 4, majors: 0 },
            { name: 'Tony Finau', country: 'USA', ranking: 15, wins: 6, majors: 0 }
        ];
        
        for (const golfer of sampleGolfers) {
            await query(`
                INSERT INTO golfers (name, country, world_ranking, pga_tour_wins, major_wins, is_active) 
                VALUES ($1, $2, $3, $4, $5, true)
            `, [golfer.name, golfer.country, golfer.ranking, golfer.wins, golfer.majors]);
        }
        
        await query('COMMIT');
        console.log('✅ Sample golfers restored');
        
        const countResult = await query('SELECT COUNT(*) FROM golfers');
        const count = countResult.rows[0].count;
        
        console.log(`✅ Reset complete: ${count} golfers restored`);
        
        res.json({
            success: true,
            message: `Successfully reset to ${count} original sample golfers`,
            golfers: sampleGolfers.map(g => g.name),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        try {
            await query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
        }
        
        console.error('❌ Reset failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error occurred',
            details: error.toString()
        });
    }
});

// Check current golfer status
router.get('/status', async (req, res) => {
    try {
        console.log('🔍 Checking database status...');
        
        const golferResult = await query(`
            SELECT 
                COUNT(*) as total_golfers,
                COUNT(CASE WHEN world_ranking > 0 THEN 1 END) as ranked_golfers
            FROM golfers
        `);
        
        const sampleGolfers = await query(`
            SELECT name, country, world_ranking, pga_tour_wins, major_wins 
            FROM golfers 
            ORDER BY world_ranking NULLS LAST, id 
            LIMIT 20
        `);
        
        const teamResult = await query('SELECT COUNT(*) as total_teams FROM teams');
        const userResult = await query('SELECT COUNT(*) as total_users FROM users');
        
        console.log('✅ Status check complete');
        
        res.json({
            success: true,
            stats: {
                totalGolfers: parseInt(golferResult.rows[0].total_golfers),
                rankedGolfers: parseInt(golferResult.rows[0].ranked_golfers),
                totalTeams: parseInt(teamResult.rows[0].total_teams),
                totalUsers: parseInt(userResult.rows[0].total_users)
            },
            firstTwentyGolfers: sampleGolfers.rows,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Status check failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check database status',
            details: error.toString()
        });
    }
});

// Full reset (dangerous - keeps only admin user)
router.post('/everything', async (req, res) => {
    try {
        console.log('🚨 FULL RESET: Clearing all data...');
        
        await query('BEGIN');
        
        // Delete in correct order due to foreign key constraints
        await query('DELETE FROM teams');
        await query('DELETE FROM tournament_golfers');
        await query('DELETE FROM leaderboard_cache');
        await query('DELETE FROM golfers');
        await query('DELETE FROM tournaments');
        
        // Keep admin user but delete others
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@howiesclubhouse.com';
        await query('DELETE FROM users WHERE email != $1', [adminEmail]);
        
        // Reset sequences
        await query('ALTER SEQUENCE golfers_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE tournaments_id_seq RESTART WITH 1');
        await query('ALTER SEQUENCE teams_id_seq RESTART WITH 1');
        
        await query('COMMIT');
        
        console.log('✅ Full reset complete');
        
        res.json({
            success: true,
            message: 'Full database reset completed. Only admin user preserved.',
            warning: 'All users, teams, tournaments, and golfers have been deleted.',
            nextStep: 'Use the admin "Setup Database" button to restore basic data.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        try {
            await query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
        }
        
        console.error('❌ Full reset failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Full reset failed',
            details: error.toString()
        });
    }
});

// Simple test endpoint
router.get('/test', async (req, res) => {
    try {
        const result = await query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'Reset routes are working!',
            currentTime: result.rows[0].current_time,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Test failed',
            details: error.toString()
        });
    }
});

module.exports = router;
