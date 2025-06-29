const { initializeDatabase } = require('./initDatabase');
const { addSampleData } = require('./addSampleData');

async function setupDevelopment() {
    console.log('🛠️ Setting up development environment...');
    
    try {
        await initializeDatabase();
        await addSampleData();
        
        console.log('');
        console.log('🎉 Development setup complete!');
        console.log('');
        console.log('🚀 Start the server with: npm run dev');
        console.log('🌐 Visit: http://localhost:3000');
        console.log('');
        console.log('🔑 Demo Accounts:');
        console.log('   Admin: admin@howiesclubhouse.com / admin123!');
        console.log('   Demo:  demo@howiesclubhouse.com / demo123');
        
    } catch (error) {
        console.error('💥 Development setup failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    setupDevelopment();
}

module.exports = { setupDevelopment };

