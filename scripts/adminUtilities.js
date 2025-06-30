const { query } = require('../config/database');
const scrapingService = require('../services/scrapingService');

class AdminUtilities {
    
    async triggerScrapingUpdate() {
        console.log('🔄 Manually triggering scraping update...');
        try {
            await scrapingService.runManualUpdate();
            console.log('✅ Scraping update completed successfully');
        } catch (error) {
            console.error('❌ Scraping update failed:', error);
        }
    }
    
    async testScrapingHealth() {
        console.log('🏥 Testing scraping service health...');
        try {
            const health = await scrapingService.checkScrapingHealth();
            console.log('Health check result:', health);
            return health;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return { status: 'error', message: error.message };
        }
    }
    
    async getDatabaseStats() {
        try {
            const stats = await query(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM tournaments) as total_tournaments,
                    (SELECT COUNT(*) FROM golfers WHERE is_active = true) as active_golfers,
                    (SELECT COUNT(*) FROM teams) as total_teams,
                    (SELECT COUNT(*) FROM tournament_golfers) as tournament_scores,
                    (SELECT COUNT(*) FROM tournaments WHERE is_active = true) as active_tournaments
            `);
            
            console.log('📊 Database Statistics:');
            console.log('   Users:', stats.rows[0].total_users);
            console.log('   Tournaments:', stats.rows[0].total_tournaments);
            console.log('   Active Golfers:', stats.rows[0].active_golfers);
            console.log('   Teams:', stats.rows[0].total_teams);
            console.log('   Tournament Scores:', stats.rows[0].tournament_scores);
            console.log('   Active Tournaments:', stats.rows[0].active_tournaments);
            
            return stats.rows[0];
        } catch (error) {
            console.error('❌ Failed to get database stats:', error);
            return null;
        }
    }
    
    async listTournaments() {
        try {
            const tournaments = await query(`
                SELECT id, name, location, start_date, end_date, is_active, is_completed
                FROM tournaments 
                ORDER BY start_date DESC
            `);
            
            console.log('🏆 All Tournaments:');
            tournaments.rows.forEach(t => {
                const status = t.is_active ? '[ACTIVE]' : t.is_completed ? '[COMPLETED]' : '[UPCOMING]';
                console.log(`   ${status} ${t.name} - ${t.location} (${new Date(t.start_date).toDateString()})`);
            });
            
            return tournaments.rows;
        } catch (error) {
            console.error('❌ Failed to list tournaments:', error);
            return [];
        }
    }
}

async function runCommand() {
    const command = process.argv[2];
    const admin = new AdminUtilities();
    
    switch (command) {
        case 'scrape':
            await admin.triggerScrapingUpdate();
            break;
            
        case 'health':
            await admin.testScrapingHealth();
            break;
            
        case 'stats':
            await admin.getDatabaseStats();
            break;
            
        case 'tournaments':
            await admin.listTournaments();
            break;
            
        default:
            console.log('🛠️  Howies Fantasy Clubhouse - Admin Utilities');
            console.log('');
            console.log('Available commands:');
            console.log('  scrape       - Trigger manual scraping update');
            console.log('  health       - Check scraping service health');
            console.log('  stats        - Show database statistics');
            console.log('  tournaments  - List all tournaments');
            console.log('');
            console.log('Usage: node scripts/adminUtilities.js <command>');
            break;
    }
    
    process.exit(0);
}

if (require.main === module) {
    runCommand().catch(error => {
        console.error('Command failed:', error);
        process.exit(1);
    });
}

module.exports = AdminUtilities;

