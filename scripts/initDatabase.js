const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Initializing database...');
        
        await client.query('BEGIN');
        
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                is_admin BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Tournaments table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tournaments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                course_name VARCHAR(255),
                location VARCHAR(255),
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP NOT NULL,
                is_active BOOLEAN DEFAULT FALSE,
                is_completed BOOLEAN DEFAULT FALSE,
                prize_fund DECIMAL(12,2),
                course_par INTEGER DEFAULT 72,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Golfers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS golfers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                country VARCHAR(100),
                world_ranking INTEGER DEFAULT 999,
                pga_tour_wins INTEGER DEFAULT 0,
                major_wins INTEGER DEFAULT 0,
                earnings DECIMAL(12,2) DEFAULT 0,
                fedex_cup_points INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Tournament Golfers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tournament_golfers (
                id SERIAL PRIMARY KEY,
                tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
                golfer_id INTEGER REFERENCES golfers(id) ON DELETE CASCADE,
                current_score INTEGER DEFAULT 0,
                position VARCHAR(10),
                round1_score INTEGER,
                round2_score INTEGER,
                round3_score INTEGER,
                round4_score INTEGER,
                total_score INTEGER DEFAULT 0,
                is_made_cut BOOLEAN DEFAULT TRUE,
                strokes_gained_total DECIMAL(4,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tournament_id, golfer_id)
            );
        `);
        
        // Teams table
        await client.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
                team_name VARCHAR(255),
                golfer1_id INTEGER REFERENCES golfers(id),
                golfer2_id INTEGER REFERENCES golfers(id),
                golfer3_id INTEGER REFERENCES golfers(id),
                golfer4_id INTEGER REFERENCES golfers(id),
                golfer5_id INTEGER REFERENCES golfers(id),
                golfer6_id INTEGER REFERENCES golfers(id),
                total_score INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, tournament_id)
            );
        `);
        
        // Leaderboard cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard_cache (
                id SERIAL PRIMARY KEY,
                tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                team_name VARCHAR(255),
                total_score INTEGER DEFAULT 0,
                position INTEGER,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tournament_id, user_id)
            );
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_golfers_ranking ON golfers(world_ranking);
            CREATE INDEX IF NOT EXISTS idx_golfers_active ON golfers(is_active);
            CREATE INDEX IF NOT EXISTS idx_tournaments_active ON tournaments(is_active);
            CREATE INDEX IF NOT EXISTS idx_tournaments_dates ON tournaments(start_date, end_date);
            CREATE INDEX IF NOT EXISTS idx_tournament_golfers_tournament ON tournament_golfers(tournament_id);
            CREATE INDEX IF NOT EXISTS idx_tournament_golfers_golfer ON tournament_golfers(golfer_id);
            CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
            CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);
        `);
        
        // Create admin user
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@howiesclubhouse.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123!';
        
        const existingAdmin = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
        
        if (existingAdmin.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            await client.query(`
                INSERT INTO users (email, password_hash, username, first_name, last_name, is_admin) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [adminEmail, hashedPassword, 'admin', 'Admin', 'User', true]);
            
            console.log('👤 Admin user created');
        }
        
        await client.query('COMMIT');
        console.log('✅ Database initialized successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('💥 Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

if (require.main === module) {
    initializeDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { initializeDatabase };

