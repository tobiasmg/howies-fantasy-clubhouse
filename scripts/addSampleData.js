const { query } = require('../config/database');
const bcrypt = require('bcrypt');
const scrapingService = require('../services/scrapingService');

const sampleTournaments = [
    {
        name: 'The Masters Tournament',
        courseName: 'Augusta National Golf Club',
        location: 'Augusta, GA',
        startDate: new Date('2025-04-10'),
        endDate: new Date('2025-04-13'),
        isActive: false,
        prizeFund: 18000000,
        coursePar: 72
    },
    {
        name: 'The Players Championship',
        courseName: 'TPC Sawgrass',
        location: 'Ponte Vedra Beach, FL',
        startDate: new Date('2025-03-13'),
        endDate: new Date('2025-03-16'),
        isActive: false,
        prizeFund: 25000000,
        coursePar: 72
    },
    {
        name: 'PGA Championship',
        courseName: 'Valhalla Golf Club',
        location: 'Louisville, KY',
        startDate: new Date('2025-05-15'),
        endDate: new Date('2025-05-18'),
        isActive: false,
        prizeFund: 17500000,
        coursePar: 71
    },
    {
        name: 'U.S. Open',
        courseName: 'Oakmont Country Club',
        location: 'Oakmont, PA',
        startDate: new Date('2025-06-12'),
        endDate: new Date('2025-06-15'),
        isActive: false,
        prizeFund: 20000000,
        coursePar: 70
    },
    {
        name: 'The Open Championship',
        courseName: 'Royal Troon Golf Club',
        location: 'Troon, Scotland',
        startDate: new Date('2025-07-17'),
        endDate: new Date('2025-07-20'),
        isActive: false,
        prizeFund: 16500000,
        coursePar: 71
    },
    {
        name: 'WM Phoenix Open',
        courseName: 'TPC Scottsdale',
        location: 'Scottsdale, AZ',
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-07-04'),
        isActive: true,
        prizeFund: 9100000,
        coursePar: 71
    }
];

async function addSampleData() {
    console.log('📊 Adding comprehensive sample data...');
    
    try {
        // 1. Add golfer data
        console.log('🏌️ Adding golfer data...');
        await scrapingService.addSampleGolfers();
        
        // 2. Add tournaments
        console.log('🏆 Adding tournaments...');
        for (const tournament of sampleTournaments) {
            await query(`
                INSERT INTO tournaments (name, course_name, location, start_date, end_date, is_active, prize_fund, course_par) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (name) DO UPDATE SET
                    course_name = $2,
                    location = $3,
                    start_date = $4,
                    end_date = $5,
                    is_active = $6,
                    prize_fund = $7,
                    course_par = $8,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                tournament.name, 
                tournament.courseName, 
                tournament.location, 
                tournament.startDate, 
                tournament.endDate,
                tournament.isActive,
                tournament.prizeFund,
                tournament.coursePar
            ]);
        }
        
        // 3. Create demo users
        console.log('👥 Creating demo users...');
        const demoUsers = [
            {
                email: 'demo@howiesclubhouse.com',
                password: 'demo123',
                username: 'demo_user',
                firstName: 'Demo',
                lastName: 'User'
            },
            {
                email: 'player1@howiesclubhouse.com',
                password: 'player123',
                username: 'golf_pro',
                firstName: 'Golf',
                lastName: 'Pro'
            },
            {
                email: 'player2@howiesclubhouse.com',
                password: 'player123',
                username: 'weekend_warrior',
                firstName: 'Weekend',
                lastName: 'Warrior'
            }
        ];
        
        for (const user of demoUsers) {
            const hashedPassword = await bcrypt.hash(user.password, 12);
            await query(`
                INSERT INTO users (email, password_hash, username, first_name, last_name) 
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
            `, [user.email, hashedPassword, user.username, user.firstName, user.lastName]);
        }
        
        // 4. Create sample teams
        console.log('⚡ Creating sample teams...');
        const activeTournament = await query(`
            SELECT id FROM tournaments WHERE is_active = true LIMIT 1
        `);
        
        if (activeTournament.rows.length > 0) {
            const tournamentId = activeTournament.rows[0].id;
            
            const topGolfers = await query(`
                SELECT id FROM golfers 
                WHERE is_active = true 
                ORDER BY world_ranking ASC 
                LIMIT 6
            `);
            
            if (topGolfers.rows.length >= 6) {
                const golferIds = topGolfers.rows.map(g => g.id);
                
                const demoUser = await query(`
                    SELECT id FROM users WHERE email = 'demo@howiesclubhouse.com'
                `);
                
                if (demoUser.rows.length > 0) {
                    await query(`
                        INSERT INTO teams (
                            user_id, tournament_id, team_name, 
                            golfer1_id, golfer2_id, golfer3_id, 
                            golfer4_id, golfer5_id, golfer6_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (user_id, tournament_id) DO UPDATE SET
                            team_name = $3,
                            golfer1_id = $4,
                            golfer2_id = $5,
                            golfer3_id = $6,
                            golfer4_id = $7,
                            golfer5_id = $8,
                            golfer6_id = $9
                    `, [
                        demoUser.rows[0].id,
                        tournamentId,
                        'Demo Dream Team',
                        ...golferIds
                    ]);
                    
                    console.log('✅ Sample team created for demo user');
                }
            }
        }
        
        // 5. Add sample tournament scores
        console.log('📊 Adding sample tournament scores...');
        await addSampleTournamentScores();
        
        console.log('✅ Sample data added successfully!');
        console.log('');
        console.log('🔑 Demo Accounts:');
        console.log('   Admin: admin@howiesclubhouse.com / admin123!');
        console.log('   Demo:  demo@howiesclubhouse.com / demo123');
        console.log('   User1: player1@howiesclubhouse.com / player123');
        console.log('   User2: player2@howiesclubhouse.com / player123');
        console.log('');
        console.log('🏆 Sample tournaments created with one active tournament');
        console.log('🏌️ 20+ golfers added with rankings and stats');
        console.log('⚡ Sample teams and scores created');
        
    } catch (error) {
        console.error('💥 Error adding sample data:', error);
        throw error;
    }
}

async function addSampleTournamentScores() {
    try {
        const activeTournament = await query(`
            SELECT id FROM tournaments WHERE is_active = true LIMIT 1
        `);
        
        if (activeTournament.rows.length === 0) return;
        
        const tournamentId = activeTournament.rows[0].id;
        const golfers = await query(`
            SELECT id FROM golfers 
            WHERE is_active = true 
            ORDER BY world_ranking ASC 
            LIMIT 20
        `);
        
        for (let i = 0; i < golfers.rows.length; i++) {
            const golferId = golfers.rows[i].id;
            const position = i + 1;
            const totalScore = Math.floor(Math.random() * 20) - 10;
            
            await query(`
                INSERT INTO tournament_golfers (
                    tournament_id, golfer_id, current_score, 
                    position, total_score, is_made_cut
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
                    current_score = $3,
                    position = $4,
                    total_score = $5,
                    is_made_cut = $6
            `, [
                tournamentId,
                golferId,
                totalScore,
                position.toString(),
                totalScore,
                position <= 70
            ]);
        }
        
        console.log('📊 Sample tournament scores added');
    } catch (error) {
        console.error('❌ Error adding sample scores:', error);
    }
}

if (require.main === module) {
    addSampleData()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Sample data script failed:', error);
            process.exit(1);
        });
}

module.exports = { addSampleData };

