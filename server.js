const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

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
            scriptSrcAttr: ["'unsafe-inline'"], // This line fixes the onclick events
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

// Health check endpoints
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/health/scraping', async (req, res) => {
    try {
        const health = await scrapingService.checkScrapingHealth();
        res.json(health);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
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

app.listen(PORT, () => {
    console.log(`🏌️ Howies Fantasy Clubhouse running on port ${PORT}`);
    console.log(`🕷️ Web scraping service initialized`);
});

module.exports = app;
