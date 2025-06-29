const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import auto-setup
const { autoSetup } = require('./scripts/auto-setup');

// Import database with test function
const { testConnection } = require('./config/database');

const authRoutes = require('./routes/auth');
const tournamentRoutes = require('./routes/tournaments');
const golferRoutes = require('./routes/golfers');
const teamRoutes = require('./routes/teams');
const adminRoutes = require('./routes/admin');

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

// API Routes
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

// Manual database re-initialization endpoint
app.post('/api/admin/reinitialize-database', async (req, res) => {
    try {
        console.log('🔄 Manual database reinitialization triggered...');
        await autoSetup();
        res.json({ message: 'Database reinitialization completed successfully' });
    } catch (error) {
        console.error('Database reinitialization failed:', error);
        res.status(500).json({ error: 'Failed to reinitialize database' });
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

// Enhanced startup sequence with auto-setup
async function startServer() {
    try {
        console.log('🚀 Starting Howies Fantasy Clubhouse...');
        console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
        console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set ✅' : 'Missing ❌');
        
        // Test database connection first
        console.log('🔍 Testing database connection...');
        const dbConnected = await testConnection();
        
        if (!dbConnected) {
            console.error('💥 Failed to connect to database. Check your DATABASE_URL environment variable.');
            console.error('Expected format: postgresql://user:password@host:port/database');
            
            // Wait a bit and try once more (Railway services sometimes take time to start)
            console.log('⏳ Waiting 10 seconds and retrying...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const dbConnectedRetry = await testConnection();
            if (!dbConnectedRetry) {
                console.error('💥 Database connection failed after retry. Exiting...');
                process.exit(1);
            }
        }
        
        // Run auto-setup to initialize database if needed
        console.log('🔧 Running auto-setup...');
        await autoSetup();
        
        // Start server
        app.listen(PORT, () => {
            console.log('');
            console.log('🏌️ Howies Fantasy Clubhouse is running!');
            console.log(`🌐 Port: ${PORT}`);
            console.log(`🔗 Health Check: /api/health`);
            console.log(`🕷️ Web scraping service initialized`);
            console.log('');
            console.log('🔑 Demo Accounts:');
            console.log('   Admin: admin@howiesclubhouse.com / admin123!');
            console.log('   Demo:  demo@howiesclubhouse.com / demo123');
            console.log('   Player: player1@howiesclubhouse.com / player123');
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
