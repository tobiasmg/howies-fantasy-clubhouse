# 🏌️ Howies Fantasy Clubhouse

A complete fantasy golf tournament platform where users can create teams of 6 golfers, with only the top 4 scores counting toward their total. Features automatic web scraping for live scores and golfer rankings.

## ⚡ Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

### 1. One-Click Deploy
1. Click the Railway button above
2. Connect your GitHub account
3. Add a PostgreSQL database
4. Set environment variables (see below)
5. Deploy!

### 2. Environment Variables
```env
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here
ADMIN_EMAIL=admin@howiesclubhouse.com
ADMIN_PASSWORD=SecurePassword123!
```

### 3. Initialize Database
After deployment, run these commands in Railway terminal:
```bash
railway run npm run init-db
railway run npm run sample-data
```

## 🔑 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@howiesclubhouse.com | admin123! |
| **Demo User** | demo@howiesclubhouse.com | demo123 |
| **Player 1** | player1@howiesclubhouse.com | player123 |
| **Player 2** | player2@howiesclubhouse.com | player123 |

## ✨ Features

- 👤 **User Authentication** with JWT
- 🏆 **Tournament Management** with admin controls
- 👥 **Team Creation** (6 golfers, top 4 scores count)
- 📊 **Live Leaderboards** with real-time updates
- 🕷️ **Web Scraping** for automatic golfer rankings and scores
- 🛠️ **Admin Dashboard** with management utilities
- 📱 **Mobile Responsive** design
- ⚡ **Sample Data** included (20+ golfers, 6 tournaments)

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL
- Git

### Setup
```bash
# Clone repository
git clone <your-repo-url>
cd howies-fantasy-clubhouse

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Initialize database and add sample data
npm run init-db
npm run sample-data

# Start development server
npm run dev
```

Visit `http://localhost:3000`

## 🕷️ Web Scraping Features

### Automatic Updates
- **Daily at 6 AM**: Update golfer rankings from OWGR
- **Every 15 minutes**: Update live tournament scores (during active tournaments)

### Manual Controls
```bash
# Check scraping health
node scripts/adminUtilities.js health

# Trigger manual update
node scripts/adminUtilities.js scrape

# View database statistics
node scripts/adminUtilities.js stats

# List all tournaments
node scripts/adminUtilities.js tournaments
```

## 📊 Sample Data Included

- ✅ **20+ Professional Golfers** with current rankings
- ✅ **6 Major Tournaments** (Masters, Players Championship, etc.)
- ✅ **4 Demo User Accounts** ready for testing
- ✅ **Sample Teams and Scores** for demonstration

## 🔧 Admin Features

- Dashboard with platform statistics
- User management
- Tournament activation/deactivation
- Manual scraping triggers
- Database cleanup utilities

## 🚀 Technology Stack

- **Backend**: Node.js, Express, PostgreSQL
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Web Scraping**: Puppeteer
- **Authentication**: JWT
- **Deployment**: Railway
- **Database**: PostgreSQL with automatic migrations

## 📈 Monitoring

- Health check endpoints: `/api/health` and `/api/health/scraping`
- Comprehensive logging for all operations
- Graceful error handling and fallbacks

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Ready to tee off? Deploy now and start your fantasy golf league! ⛳**
```
