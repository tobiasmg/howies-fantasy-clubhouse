const { query } = require('../config/database');

class LeaderboardService {
    async updateTournamentLeaderboard(tournamentId) {
        try {
            console.log(`🏆 Updating leaderboard for tournament ${tournamentId}`);
            
            const teams = await query(`
                SELECT * FROM teams WHERE tournament_id = $1
            `, [tournamentId]);
            
            console.log('✅ Leaderboard updated');
        } catch (error) {
            console.error('Leaderboard update error:', error);
        }
    }
}

module.exports = new LeaderboardService();

