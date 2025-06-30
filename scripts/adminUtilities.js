// scripts/adminUtilities.js - Enhanced admin utilities for OWGR integration
const OWGRScraper = require('./owgrScraper');
const pool = require('../config/database');

class AdminUtilities {
    static async scrapePlayers() {
        console.log('🏌️ Starting manual player database update...');
        const scraper = new OWGRScraper();
        await scraper.runWeeklyPlayerUpdate();
    }

    static async scrapeScores() {
        console.log('📊 Starting manual score update...');
        const scraper = new OWGRScraper();
        await scraper.runDailyScoreUpdate();
    }

    static async scrapingHealth() {
        console.log('🔍 Checking scraping system health...');
        const scraper = new OWGRScraper();
        const health = await scraper.getScrapingHealth();
        
        console.log(`\n📈 SCRAPING HEALTH REPORT`);
        console.log(`Total Players: ${health.totalPlayers}`);
        console.log(`Last Update: ${health.lastUpdate || 'Never'}`);
        console.log(`\n📝 Recent Activity:`);
        
        if (health.recentLogs.length === 0) {
            console.log('   No recent activity logged');
        } else {
            health.recentLogs.forEach((log, index) => {
                const status = log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⚠️';
                console.log(`${index + 1}. ${status} [${log.type}] ${log.message}`);
                if (log.players_updated) console.log(`   Players updated: ${log.players_updated}`);
                if (log.error_details) console.log(`   Error: ${log.error_details}`);
            });
        }
    }

    static async databaseStats() {
        console.log('📊 Fetching database statistics...');
        const client = await pool.connect();
        
        try {
            const stats = await client.query(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM golfers) as total_golfers,
                    (SELECT COUNT(*) FROM golfers WHERE current_ranking > 0) as ranked_golfers,
                    (SELECT COUNT(*) FROM tournaments) as total_tournaments,
                    (SELECT COUNT(*) FROM tournaments WHERE is_active = true) as active_tournaments,
                    (SELECT COUNT(*) FROM teams) as total_teams,
                    (SELECT COUNT(DISTINCT user_id) FROM teams) as users_with_teams
            `);
            
            const rankings = await client.query(`
                SELECT 
                    COUNT(CASE WHEN current_ranking <= 10 THEN 1 END) as top_10,
                    COUNT(CASE WHEN current_ranking <= 50 THEN 1 END) as top_50,
                    COUNT(CASE WHEN current_ranking <= 100 THEN 1 END) as top_100,
                    MIN(NULLIF(current_ranking, 0)) as highest_rank,
                    MAX(current_ranking) as lowest_rank
                FROM golfers 
                WHERE current_ranking > 0
            `);
            
            const s = stats.rows[0];
            const r = rankings.rows[0];
            
            console.log(`\n🏌️ HOWIE'S FANTASY CLUBHOUSE - DATABASE STATS`);
            console.log(`\n👥 Users & Teams:`);
            console.log(`   Total Users: ${s.total_users}`);
            console.log(`   Users with Teams: ${s.users_with_teams}`);
            console.log(`   Total Teams: ${s.total_teams}`);
            
            console.log(`\n🏆 Tournaments:`);
            console.log(`   Total Tournaments: ${s.total_tournaments}`);
            console.log(`   Active Tournaments: ${s.active_tournaments}`);
            
            console.log(`\n⛳ Golfers:`);
            console.log(`   Total Golfers: ${s.total_golfers}`);
            console.log(`   OWGR Ranked: ${s.ranked_golfers}`);
            console.log(`   Top 10 Players: ${r.top_10 || 0}`);
            console.log(`   Top 50 Players: ${r.top_50 || 0}`);
            console.log(`   Top 100 Players: ${r.top_100 || 0}`);
            if (r.highest_rank && r.lowest_rank) {
                console.log(`   Ranking Range: #${r.highest_rank} - #${r.lowest_rank}`);
            }
            
        } finally {
            client.release();
        }
    }

    static async listTournaments() {
        console.log('🏆 Fetching tournament list...');
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    id, name, location, start_date, end_date, is_active,
                    (SELECT COUNT(*) FROM teams WHERE tournament_id = tournaments.id) as team_count
                FROM tournaments 
                ORDER BY start_date DESC
            `);
            
            console.log(`\n🏆 TOURNAMENTS (${result.rows.length} total)`);
            if (result.rows.length === 0) {
                console.log('   No tournaments found');
            } else {
                result.rows.forEach(t => {
                    const status = t.is_active ? '🟢 ACTIVE' : '⚪ INACTIVE';
                    const startDate = t.start_date ? t.start_date.toISOString().split('T')[0] : 'TBD';
                    const endDate = t.end_date ? t.end_date.toISOString().split('T')[0] : 'TBD';
                    const dates = `${startDate} - ${endDate}`;
                    console.log(`${status} ${t.name}`);
                    console.log(`   Location: ${t.location || 'TBD'}`);
                    console.log(`   Dates: ${dates}`);
                    console.log(`   Teams: ${t.team_count}`);
                    console.log('');
                });
            }
            
        } finally {
            client.release();
        }
    }

    static async testConnection() {
        console.log('🔌 Testing database connection...');
        const client = await pool.connect();
        
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as db_version');
            console.log('✅ Database connection successful');
            console.log(`   Current time: ${result.rows[0].current_time}`);
            console.log(`   Database: ${result.rows[0].db_version.split(' ')[0]}`);
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
        } finally {
            client.release();
        }
    }

    static async cleanupLogs() {
        console.log('🧹 Cleaning up old scraping logs...');
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                DELETE FROM scraping_logs 
                WHERE created_at < NOW() - INTERVAL '30 days'
                RETURNING id
            `);
            console.log(`✅ Cleaned up ${result.rowCount} old log entries`);
        } catch (error) {
            console.error('❌ Error cleaning logs:', error.message);
        } finally {
            client.release();
        }
    }

    static showHelp() {
        console.log(`\n🏌️ HOWIE'S FANTASY CLUBHOUSE - ADMIN UTILITIES`);
        console.log(`\nUsage: node scripts/adminUtilities.js [command]`);
        console.log(`\nCommands:`);
        console.log(`  scrape       - Update player database from OWGR`);
        console.log(`  scores       - Update live tournament scores`);
        console.log(`  health       - Check scraping system health`);
        console.log(`  stats        - Show database statistics`);
        console.log(`  tournaments  - List all tournaments`);
        console.log(`  test         - Test database connection`);
        console.log(`  cleanup      - Clean old log entries`);
        console.log(`  help         - Show this help message`);
        console.log(`\nExamples for Railway console:`);
        console.log(`  railway run node scripts/adminUtilities.js stats`);
        console.log(`  railway run node scripts/owgrScraper.js players`);
        console.log(`  railway run node scripts/adminUtilities.js health`);
    }
}

// Command line interface
if (require.main === module) {
    const command = process.argv[2] || 'help';
    
    switch (command) {
        case 'scrape':
            AdminUtilities.scrapePlayers()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'scores':
            AdminUtilities.scrapeScores()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'health':
            AdminUtilities.scrapingHealth()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'stats':
            AdminUtilities.databaseStats()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'tournaments':
            AdminUtilities.listTournaments()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'test':
            AdminUtilities.testConnection()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'cleanup':
            AdminUtilities.cleanupLogs()
                .then(() => process.exit(0))
                .catch(error => {
                    console.error('Error:', error);
                    process.exit(1);
                });
            break;
        case 'help':
        default:
            AdminUtilities.showHelp();
            process.exit(0);
    }
}

module.exports = AdminUtilities;
