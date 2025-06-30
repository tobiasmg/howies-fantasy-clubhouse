// routes/migrate.js - Web-based migration endpoints for OWGR integration
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const OWGRScraper = require('../scripts/owgrScraper');

// Run database migration endpoint
router.post('/run-migration', async (req, res) => {
    try {
        console.log('🔄 Running OWGR database migration...');
        
        await query('BEGIN');
        
        // Create scraping logs table
        await query(`
            CREATE TABLE IF NOT EXISTS scraping_logs (
                id SERIAL PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL,
                message TEXT,
                players_updated INTEGER DEFAULT 0,
                scores_updated INTEGER DEFAULT 0,
                error_details TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Add OWGR fields to golfers table
        await query(`
            ALTER TABLE golfers 
            ADD COLUMN IF NOT EXISTS owgr_points DECIMAL(10,2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS events_played INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
        `);
        
        // Add indexes for performance
        await query(`
            CREATE INDEX IF NOT EXISTS idx_golfers_owgr_ranking ON golfers(world_ranking);
            CREATE INDEX IF NOT EXISTS idx_golfers_owgr_points ON golfers(owgr_points);
            CREATE INDEX IF NOT EXISTS idx_golfers_country ON golfers(country);
            CREATE INDEX IF NOT EXISTS idx_golfers_updated ON golfers(updated_at);
            CREATE INDEX IF NOT EXISTS idx_scraping_logs_type ON scraping_logs(type, created_at);
        `);
        
        // Update existing golfers with OWGR data
        await query(`
            UPDATE golfers SET 
                owgr_points = CASE name
                    WHEN 'Scottie Scheffler' THEN 14.59
                    WHEN 'Jon Rahm' THEN 11.35
                    WHEN 'Rory McIlroy' THEN 7.61
                    WHEN 'Patrick Cantlay' THEN 6.27
                    WHEN 'Xander Schauffele' THEN 6.25
                    WHEN 'Viktor Hovland' THEN 5.34
                    WHEN 'Collin Morikawa' THEN 5.06
                    WHEN 'Wyndham Clark' THEN 4.73
                    WHEN 'Justin Thomas' THEN 4.63
                    WHEN 'Jordan Spieth' THEN 4.05
                    WHEN 'Max Homa' THEN 3.99
                    WHEN 'Jason Day' THEN 3.78
                    WHEN 'Brian Harman' THEN 3.67
                    WHEN 'Russell Henley' THEN 3.46
                    WHEN 'Tony Finau' THEN 3.36
                    ELSE owgr_points
                END,
                events_played = CASE name
                    WHEN 'Scottie Scheffler' THEN 41
                    WHEN 'Jon Rahm' THEN 35
                    WHEN 'Rory McIlroy' THEN 39
                    WHEN 'Patrick Cantlay' THEN 42
                    WHEN 'Xander Schauffele' THEN 44
                    WHEN 'Viktor Hovland' THEN 46
                    WHEN 'Collin Morikawa' THEN 45
                    WHEN 'Wyndham Clark' THEN 42
                    WHEN 'Justin Thomas' THEN 55
                    WHEN 'Jordan Spieth' THEN 49
                    WHEN 'Max Homa' THEN 40
                    WHEN 'Jason Day' THEN 45
                    WHEN 'Brian Harman' THEN 51
                    WHEN 'Russell Henley' THEN 38
                    WHEN 'Tony Finau' THEN 46
                    ELSE events_played
                END,
                updated_at = NOW()
            WHERE name IN (
                'Scottie Scheffler', 'Jon Rahm', 'Rory McIlroy', 'Patrick Cantlay',
                'Xander Schauffele', 'Viktor Hovland', 'Collin Morikawa', 'Wyndham Clark',
                'Justin Thomas', 'Jordan Spieth', 'Max Homa', 'Jason Day',
                'Brian Harman', 'Russell Henley', 'Tony Finau'
            )
        `);
        
        // Log the migration
        await query(`
            INSERT INTO scraping_logs (type, status, message, created_at)
            VALUES ('migration', 'success', 'OWGR database migration completed via web interface', NOW())
        `);
        
        await query('COMMIT');
        
        console.log('✅ OWGR migration completed successfully');
        
        res.json({ 
            success: true, 
            message: 'OWGR database migration completed successfully',
            details: 'Added OWGR fields, indexes, and updated existing golfer data',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        try {
            await query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
        }
        
        console.error('❌ Migration failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Migration failed',
            details: error.toString()
        });
    }
});

// Load players from OWGR endpoint
router.post('/load-players', async (req, res) => {
    try {
        console.log('🏌️ Starting OWGR player database update...');
        
        const scraper = new OWGRScraper();
        await scraper.runWeeklyPlayerUpdate();
        
        // Get updated count
        const countResult = await query('SELECT COUNT(*) as count FROM golfers');
        const totalPlayers = countResult.rows[0].count;
        
        console.log('✅ Player loading completed successfully');
        
        res.json({ 
            success: true, 
            message: `Successfully loaded/updated players from OWGR`,
            totalPlayers: parseInt(totalPlayers),
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Player loading failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Player loading failed',
            details: error.toString()
        });
    }
});

// Check migration status
router.get('/status', async (req, res) => {
    try {
        console.log('🔍 Checking OWGR migration status...');
        
        // Check if scraping_logs table exists
        let migrationComplete = false;
        try {
            await query('SELECT 1 FROM scraping_logs LIMIT 1');
            migrationComplete = true;
        } catch (error) {
            migrationComplete = false;
        }
        
        // Get golfer statistics
        const golferStats = await query(`
            SELECT 
                COUNT(*) as total_golfers,
                COUNT(CASE WHEN world_ranking > 0 AND world_ranking < 999 THEN 1 END) as ranked_golfers,
                COUNT(CASE WHEN owgr_points > 0 THEN 1 END) as golfers_with_owgr_points,
                MIN(NULLIF(world_ranking, 0)) as highest_ranking,
                MAX(CASE WHEN world_ranking < 999 THEN world_ranking END) as lowest_ranking
            FROM golfers
        `);
        
        // Get recent scraping logs if available
        let recentLogs = [];
        if (migrationComplete) {
            try {
                const logsResult = await query(`
                    SELECT type, status, message, players_updated, created_at, error_details
                    FROM scraping_logs 
                    ORDER BY created_at DESC 
                    LIMIT 5
                `);
                recentLogs = logsResult.rows;
            } catch (error) {
                console.log('Could not fetch scraping logs:', error.message);
            }
        }
        
        const stats = golferStats.rows[0];
        
        res.json({
            success: true,
            migrationComplete,
            totalPlayers: parseInt(stats.total_golfers),
            rankedPlayers: parseInt(stats.ranked_golfers),
            playersWithOwgrPoints: parseInt(stats.golfers_with_owgr_points),
            rankingRange: {
                highest: stats.highest_ranking || null,
                lowest: stats.lowest_ranking || null
            },
            recentLogs,
            lastUpdate: recentLogs[0]?.created_at || null,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Status check failed:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Status check failed',
            details: error.toString()
        });
    }
});

// Get database stats for admin
router.get('/stats', async (req, res) => {
    try {
        const stats = await query(`
            SELECT 
                (SELECT COUNT(*) FROM golfers) as total_golfers,
                (SELECT COUNT(*) FROM golfers WHERE world_ranking > 0 AND world_ranking < 999) as ranked_golfers,
                (SELECT COUNT(*) FROM golfers WHERE owgr_points > 0) as golfers_with_owgr_points,
                (SELECT COUNT(*) FROM tournaments) as total_tournaments,
                (SELECT COUNT(*) FROM teams) as total_teams,
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(DISTINCT user_id) FROM teams) as users_with_teams
        `);
        
        // Get top 10 golfers as sample
        const topGolfers = await query(`
            SELECT name, country, world_ranking, owgr_points, events_played
            FROM golfers 
            WHERE world_ranking > 0 AND world_ranking < 999
            ORDER BY world_ranking 
            LIMIT 10
        `);
        
        res.json({
            success: true,
            stats: stats.rows[0],
            topTenGolfers: topGolfers.rows,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Stats failed',
            details: error.toString()
        });
    }
});

// Test endpoint
router.get('/test', async (req, res) => {
    try {
        const result = await query('SELECT NOW() as current_time');
        res.json({
            success: true,
            message: 'OWGR migration routes are working!',
            currentTime: result.rows[0].current_time,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Test failed',
            details: error.toString()
        });
    }
});

module.exports = router;
