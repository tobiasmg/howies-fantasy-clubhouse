// routes/reset.js - Clean database reset before OWGR upgrade
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Reset golfers to original 15 sample players
router.post('/golfers-only', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        console.log('🔄 Resetting golfers to original sample data...');
        
        // Delete all golfers
        await client.query('DELETE FROM golfers');
        
        // Insert original 15 sample golfers
        const sampleGolfers = [
            { name: 'Scottie Scheffler', country: 'USA' },
            { name: 'Xander Schauffele', country: 'USA' },
            { name: 'Rory McIlroy', country: 'NIR' },
            { name: 'Collin Morikawa', country: 'USA' },
            { name: 'Viktor Hovland', country: 'NOR' },
            { name: 'Ludvig Aberg', country: 'SWE' },
            { name: 'Wyndham Clark', country: 'USA' },
            { name: 'JJ Spaun', country: 'USA' },
            { name: 'Patrick Cantlay', country: 'USA' },
            { name: 'Sahith Theegala', country: 'USA' },
            { name: 'Robert MacIntyre', country: 'SCO' },
            { name: 'Bryson DeChambeau', country: 'USA' },
            { name: 'Max Homa', country: 'USA' },
            { name: 'Tony Finau', country: 'USA' },
            { name: 'Hideki Matsuyama', country: 'JPN' }
        ];
        
        for (const golfer of sampleGolfers) {
            await client.query(
                'INSERT INTO golfers (name, country) VALUES ($1, $2)',
                [golfer.name, golfer.country]
            );
        }
        
        await client.query('COMMIT');
        
        const countResult = await client.query('SELECT COUNT(*) FROM golfers');
        const count = countResult.rows[0].count;
        
        console.log(`✅ Reset complete: ${count} golfers restored`);
        
        res.json({
            success: true,
            message: `Successfully reset to ${count} original sample golfers`,
            golfers: sampleGolfers.map(g => g.name),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Reset failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
});

// Check current golfer status
router.get('/status', async (req, res) => {
    const client = await pool.connect();
    try {
        const golferResult = await client.query(`
            SELECT 
                COUNT(*) as total_golfers,
                COUNT(CASE WHEN current_ranking > 0 THEN 1 END) as ranked_golfers
            FROM golfers
        `);
        
        const sampleGolfers = await client.query(`
            SELECT name, country, current_ranking, owgr_points 
            FROM golfers 
            ORDER BY id 
            LIMIT 15
        `);
        
        const teamResult = await client.query('SELECT COUNT(*) as total_teams FROM teams');
        const userResult = await client.query('SELECT COUNT(*) as total_users FROM users');
        
        res.json({
            success: true,
            stats: {
                totalGolfers: parseInt(golferResult.rows[0].total_golfers),
                rankedGolfers: parseInt(golferResult.rows[0].ranked_golfers),
                totalTeams: parseInt(teamResult.rows[0].total_teams),
                totalUsers: parseInt(userResult.rows[0].total_users)
            },
            firstFifteenGolfers: sampleGolfers.rows,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
});

// Full reset (dangerous - keeps only admin user)
router.post('/everything', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        console.log('🚨 FULL RESET: Clearing all data...');
        
        // Delete in correct order due to foreign key constraints
        await client.query('DELETE FROM teams');
        await client.query('DELETE FROM tournament_golfers');
        await client.query('DELETE FROM golfers');
        await client.query('DELETE FROM tournaments');
        await client.query('DELETE FROM users WHERE email != $1', [process.env.ADMIN_EMAIL || 'admin@howiesclubhouse.com']);
        
        // Reset sequences
        await client.query('ALTER SEQUENCE golfers_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE tournaments_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE teams_id_seq RESTART WITH 1');
        
        await client.query('COMMIT');
        
        console.log('✅ Full reset complete');
        
        res.json({
            success: true,
            message: 'Full database reset completed. Only admin user preserved.',
            warning: 'All users, teams, tournaments, and golfers have been deleted.',
            nextStep: 'Run your sample data script to restore basic data.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Full reset failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        client.release();
    }
});

module.exports = router;
