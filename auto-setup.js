// scripts/auto-setup.js
const { query } = require('../config/database');
const { initializeDatabase } = require('./initDatabase');
const { addSampleData } = require('./addSampleData');

async function checkDatabaseExists() {
    try {
        // Try to query the users table
        const result = await query('SELECT COUNT(*) FROM users');
        return result.rows.length > 0;
    } catch (error) {
        // If table doesn't exist, we need to initialize
        return false;
    }
}

async function autoSetup() {
    console.log('🔍 Checking database setup...');
    
    try {
        const dbExists = await checkDatabaseExists();
        
        if (!dbExists) {
            console.log('🚀 Database not initialized. Running setup...');
            
            // Initialize database
            await initializeDatabase();
            console.log('✅ Database initialized');
            
            // Add sample data
            await addSampleData();
            console.log('✅ Sample data added');
            
            console.log('');
            console.log('🎉 Railway setup complete!');
            console.log('🔑 Demo Accounts:');
            console.log('   Admin: admin@howiesclubhouse.com / admin123!');
            console.log('   Demo:  demo@howiesclubhouse.com / demo123');
            console.log('   Player: player1@howiesclubhouse.com / player123');
            console.log('');
        } else {
            console.log('✅ Database already initialized');
        }
        
    } catch (error) {
        console.error('💥 Auto-setup failed:', error.message);
        
        // Don't exit - let the app try to start anyway
        console.log('⚠️  Continuing with app startup...');
    }
}

if (require.main === module) {
    autoSetup()
        .then(() => {
            console.log('✅ Auto-setup completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Auto-setup failed:', error);
            process.exit(1);
        });
}

module.exports = { autoSetup };
