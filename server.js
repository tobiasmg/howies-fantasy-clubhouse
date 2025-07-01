const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { query } = require('./config/database');
const authRoutes = require('./routes/auth');
const tournamentRoutes = require('./routes/tournaments');
const golferRoutes = require('./routes/golfers');
const teamRoutes = require('./routes/teams');
const adminRoutes = require('./routes/admin');
const resetRoutes = require('./routes/reset'); // Add this line

// Initialize scraping service
const scrapingService = require('./services/scrapingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"], // Fixes onclick handlers
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"]
        }
    }
}));

app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Database initialization functions (built into server.js)
async function testConnection() {
    try {
        const result = await query('SELECT NOW() as current_time');
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

async function checkIfDatabaseInitialized() {
    try {
        const result = await query('SELECT COUNT(*) FROM users');
        return result.rows.length > 0;
    } catch (error) {
        return false;
    }
}

async function initializeDatabase() {
    try {
        console.log('🚀 Initializing database...');
        
        await query('BEGIN');
        
        // Users table
        await query(`
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
        await query(`
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
        await query(`
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
        await query(`
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
        await query(`
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Ensure unique constraint exists (one team per user per tournament)
        await query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'teams_user_tournament_unique'
                ) THEN
                    ALTER TABLE teams ADD CONSTRAINT teams_user_tournament_unique UNIQUE (user_id, tournament_id);
                END IF;
            END $$;
        `);
        
        // Leaderboard cache table
        await query(`
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
        await query(`
            CREATE INDEX IF NOT EXISTS idx_golfers_ranking ON golfers(world_ranking);
            CREATE INDEX IF NOT EXISTS idx_golfers_active ON golfers(is_active);
            CREATE INDEX IF NOT EXISTS idx_tournaments_active ON tournaments(is_active);
            CREATE INDEX IF NOT EXISTS idx_tournaments_dates ON tournaments(start_date, end_date);
            CREATE INDEX IF NOT EXISTS idx_tournament_golfers_tournament ON tournament_golfers(tournament_id);
            CREATE INDEX IF NOT EXISTS idx_tournament_golfers_golfer ON tournament_golfers(golfer_id);
            CREATE INDEX IF NOT EXISTS idx_teams_tournament ON teams(tournament_id);
            CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);
        `);
        
        await query('COMMIT');
        console.log('✅ Database tables created');
        
    } catch (error) {
        await query('ROLLBACK');
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

async function addInitialData() {
    try {
        console.log('👤 Creating admin user...');
        
        const bcrypt = require('bcrypt');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@howiesclubhouse.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123!';
        
        const existingAdmin = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
        
        if (existingAdmin.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            await query(`
                INSERT INTO users (email, password_hash, username, first_name, last_name, is_admin) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [adminEmail, hashedPassword, 'admin', 'Admin', 'User', true]);
            console.log('✅ Admin user created');
        }
        
        // Add demo users
        const demoUsers = [
            { email: 'demo@howiesclubhouse.com', password: 'demo123', username: 'demo_user', firstName: 'Demo', lastName: 'User' },
            { email: 'player1@howiesclubhouse.com', password: 'player123', username: 'golf_pro', firstName: 'Golf', lastName: 'Pro' },
            { email: 'player2@howiesclubhouse.com', password: 'player123', username: 'weekend_warrior', firstName: 'Weekend', lastName: 'Warrior' }
        ];
        
        for (const user of demoUsers) {
            const existing = await query('SELECT id FROM users WHERE email = $1', [user.email]);
            if (existing.rows.length === 0) {
                const hashedPassword = await bcrypt.hash(user.password, 12);
                await query(`
                    INSERT INTO users (email, password_hash, username, first_name, last_name) 
                    VALUES ($1, $2, $3, $4, $5)
                `, [user.email, hashedPassword, user.username, user.firstName, user.lastName]);
            }
        }
        console.log('✅ Demo users created');
        
        // 🔧 ADD THIS SECTION - Enhanced Scraping Schema Update
        console.log('🔧 Ensuring enhanced scraping schema...');
        try {
            await query(`
                ALTER TABLE golfers 
                ADD COLUMN IF NOT EXISTS owgr_points DECIMAL(10,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS season_earnings DECIMAL(12,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS fedex_cup_points INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS data_source VARCHAR(100),
                ADD COLUMN IF NOT EXISTS last_scraped TIMESTAMP
            `);
            console.log('✅ Enhanced scraping schema ready');
        } catch (schemaError) {
            console.error('⚠️ Schema update error (non-critical):', schemaError.message);
            // Continue execution even if schema update fails
        }
        // 🔧 END OF SCHEMA UPDATE SECTION
        
        // Add sample golfers
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
                ON CONFLICT (name) DO NOTHING
            `, [golfer.name, golfer.country, golfer.ranking, golfer.wins, golfer.majors]);
        }
        console.log('✅ Sample golfers added');
        
        // Add sample tournaments
        const sampleTournaments = [
            {
                name: 'WM Phoenix Open',
                courseName: 'TPC Scottsdale',
                location: 'Scottsdale, AZ',
                startDate: new Date('2025-07-01'),
                endDate: new Date('2025-07-04'),
                isActive: true,
                prizeFund: 9100000,
                coursePar: 71
            },
            {
                name: 'The Masters Tournament',
                courseName: 'Augusta National Golf Club',
                location: 'Augusta, GA',
                startDate: new Date('2025-04-10'),
                endDate: new Date('2025-04-13'),
                isActive: false,
                prizeFund: 18000000,
                coursePar: 72
            }
        ];
        
        for (const tournament of sampleTournaments) {
            await query(`
                INSERT INTO tournaments (name, course_name, location, start_date, end_date, is_active, prize_fund, course_par) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
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
        console.log('✅ Sample tournaments added');
        
    } catch (error) {
        console.error('❌ Error adding initial data:', error);
    }
}

// API Routes
app.use('/api/reset', resetRoutes);        // Add this line
app.use('/api/auth', authRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/golfers', golferRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/admin', adminRoutes);

// Enhanced health check endpoints
app.get('/api/health', async (req, res) => {
    try {
        const dbConnected = await testConnection();
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: dbConnected ? 'connected' : 'disconnected',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/health/database', async (req, res) => {
    try {
        const dbConnected = await testConnection();
        if (dbConnected) {
            res.json({ status: 'healthy', message: 'Database connection successful' });
        } else {
            res.status(500).json({ status: 'error', message: 'Database connection failed' });
        }
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.get('/api/health/scraping', async (req, res) => {
    try {
        const health = await scrapingService.checkScrapingHealth();
        res.json(health);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Manual database setup endpoint
app.post('/api/admin/setup-database', async (req, res) => {
    try {
        console.log('🔄 Manual database setup triggered...');
        await initializeDatabase();
        await addInitialData();
        res.json({ message: 'Database setup completed successfully' });
    } catch (error) {
        console.error('Database setup failed:', error);
        res.status(500).json({ error: 'Failed to setup database' });
    }
});

// Manual scraping trigger
app.post('/api/admin/trigger-scraping', async (req, res) => {
    try {
        console.log('🔄 Manual scraping triggered...');
        scrapingService.runManualUpdate();
        res.json({ message: 'Scraping update triggered successfully' });
    } catch (error) {
        console.error('Manual scraping trigger failed:', error);
        res.status(500).json({ error: 'Failed to trigger scraping update' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handling
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
    });
});

// Enhanced startup sequence
async function startServer() {
    try {
        console.log('🚀 Starting Howies Fantasy Clubhouse...');
        console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
        console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set ✅' : 'Missing ❌');
        
        // Test database connection
        console.log('🔍 Testing database connection...');
        const dbConnected = await testConnection();
        
        if (!dbConnected) {
            console.error('💥 Failed to connect to database.');
            console.log('⏳ Waiting 10 seconds and retrying...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const dbConnectedRetry = await testConnection();
            if (!dbConnectedRetry) {
                console.error('💥 Database connection failed after retry. Check your DATABASE_URL.');
                process.exit(1);
            }
        }
        
        // Check if database is initialized
        console.log('🔍 Checking if database is initialized...');
        const isInitialized = await checkIfDatabaseInitialized();
        
        if (!isInitialized) {
            console.log('🛠️ Database not initialized. Setting up...');
            await initializeDatabase();
            await addInitialData();
            console.log('✅ Database setup complete!');
        } else {
            console.log('✅ Database already initialized');
        }
        
        // Start server
        app.listen(PORT, () => {
            console.log('');
            console.log('🏌️ Howies Fantasy Clubhouse is running!');
            console.log(`🌐 Port: ${PORT}`);
            console.log(`🔗 Health Check: /api/health`);
            console.log(`🔄 Reset Tool: /reset.html`);     // Add this line
            console.log(`🕷️ Web scraping service initialized`);
            console.log('');
            console.log('🔑 Demo Accounts:');
            console.log('   Admin: admin@howiesclubhouse.com / admin123!');
            console.log('   Demo:  demo@howiesclubhouse.com / demo123');
            console.log('   Player1: player1@howiesclubhouse.com / player123');
            console.log('   Player2: player2@howiesclubhouse.com / player123');
            console.log('');
            console.log('✅ Ready to accept connections!');
        });
        
    } catch (error) {
        console.error('💥 Server startup failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    await scrapingService.cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    await scrapingService.cleanup();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;
