const puppeteer = require('puppeteer');
const cron = require('node-cron');
const { query } = require('../config/database');

class ScrapingService {
    constructor() {
        this.isRunning = false;
        this.browser = null;
        this.setupCronJobs();
    }

  setupCronJobs() {
    // Update golfer rankings daily at 6 AM
    cron.schedule('0 6 * * *', () => {
        console.log('🕒 Daily golfer rankings update...');
        this.updateGolferRankings();
    });

    // Auto-manage tournaments every hour
    cron.schedule('0 * * * *', () => {
        console.log('🏆 Hourly tournament management...');
        this.autoManageTournaments();
    });

    // Update live scores every 15 minutes during active tournaments
    cron.schedule('*/15 * * * *', () => {
        this.updateLiveScores();
    });

    console.log('📅 Enhanced scraping cron jobs scheduled');
}
    }

    async getBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });
        }
        return this.browser;
    }

    async updateGolferRankings() {
        if (this.isRunning) {
            console.log('⏳ Scraping already in progress, skipping...');
            return;
        }
        
        this.isRunning = true;
        let browser;

        try {
            console.log('🏌️ Starting golfer rankings update...');
            
            browser = await this.getBrowser();
            const page = await browser.newPage();
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.setViewport({ width: 1366, height: 768 });

            // Scrape OWGR (Official World Golf Ranking)
            await page.goto('http://www.owgr.com/ranking', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            await page.waitForSelector('table', { timeout: 15000 });

            const golfers = await page.evaluate(() => {
                const rows = document.querySelectorAll('table tbody tr');
                const golferData = [];
                
                for (let i = 0; i < Math.min(rows.length, 100); i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length >= 4) {
                        const rank = cells[0]?.textContent?.trim();
                        const name = cells[2]?.textContent?.trim();
                        const country = cells[3]?.textContent?.trim();
                        
                        if (name && rank) {
                            golferData.push({
                                rank: parseInt(rank) || 999,
                                name: name,
                                country: country || 'Unknown'
                            });
                        }
                    }
                }
                
                return golferData;
            });

            console.log(`📊 Scraped ${golfers.length} golfers from OWGR`);

            // Update database
            for (const golfer of golfers) {
                try {
                    await query(`
                        INSERT INTO golfers (name, country, world_ranking, is_active) 
                        VALUES ($1, $2, $3, true)
                        ON CONFLICT (name) DO UPDATE SET
                            world_ranking = $3,
                            country = $2,
                            updated_at = CURRENT_TIMESTAMP
                    `, [golfer.name, golfer.country, golfer.rank]);
                } catch (dbError) {
                    console.error(`❌ Database error for ${golfer.name}:`, dbError.message);
                }
            }

            await page.close();
            console.log('✅ Golfer rankings update completed');

        } catch (error) {
            console.error('❌ Golfer ranking update failed:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    async updateLiveScores() {
        const activeTournaments = await query(`
            SELECT id, name, start_date, end_date FROM tournaments 
            WHERE is_active = true 
            AND start_date <= CURRENT_TIMESTAMP 
            AND end_date >= CURRENT_TIMESTAMP
        `);

        if (activeTournaments.rows.length === 0) {
            return;
        }

        let browser;
        try {
            console.log('🏆 Updating live tournament scores...');
            
            browser = await this.getBrowser();
            
            for (const tournament of activeTournaments.rows) {
                await this.scrapeTournamentScores(browser, tournament);
            }

        } catch (error) {
            console.error('❌ Live score update failed:', error.message);
        }
    }

    async scrapeTournamentScores(browser, tournament) {
        const page = await browser.newPage();
        
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            
            await page.goto('https://www.espn.com/golf/leaderboard', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            const tournamentExists = await page.$('.Leaderboard');
            
            if (!tournamentExists) {
                console.log('📝 No active tournament found on ESPN');
                await page.close();
                return;
            }

            await page.waitForSelector('.Leaderboard', { timeout: 10000 });

            const scores = await page.evaluate(() => {
                const rows = document.querySelectorAll('.Leaderboard .Table__TR');
                const scoreData = [];
                
                for (let i = 0; i < Math.min(rows.length, 50); i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('.Table__TD');
                    
                    if (cells.length >= 4) {
                        const position = cells[0]?.textContent?.trim();
                        const nameElement = cells[1]?.querySelector('a');
                        const name = nameElement?.textContent?.trim();
                        const score = cells[2]?.textContent?.trim();
                        const total = cells[3]?.textContent?.trim();
                        
                        if (name && position) {
                            scoreData.push({
                                position: position,
                                name: name,
                                score: score || 'E',
                                total: total || '0'
                            });
                        }
                    }
                }
                
                return scoreData;
            });

            console.log(`📊 Scraped ${scores.length} scores for current tournament`);

            for (const score of scores) {
                try {
                    const golferResult = await query(`
                        SELECT id FROM golfers 
                        WHERE LOWER(name) LIKE LOWER($1) 
                        OR LOWER($1) LIKE LOWER('%' || SPLIT_PART(name, ' ', 2) || '%')
                        LIMIT 1
                    `, [`%${score.name}%`]);

                    if (golferResult.rows.length > 0) {
                        const golferId = golferResult.rows[0].id;
                        
                        const totalScore = score.total === 'E' ? 0 : 
                                         parseInt(score.total.replace(/[^-\d]/g, '')) || 0;
                        
                        await query(`
                            INSERT INTO tournament_golfers (tournament_id, golfer_id, current_score, position, total_score)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
                                current_score = $3,
                                position = $4,
                                total_score = $5,
                                updated_at = CURRENT_TIMESTAMP
                        `, [tournament.id, golferId, totalScore, score.position, totalScore]);
                    }
                } catch (dbError) {
                    console.error(`❌ Database error for ${score.name}:`, dbError.message);
                }
            }

            console.log(`✅ Updated scores for ${tournament.name}`);

        } catch (error) {
            console.error(`❌ Failed to scrape scores for ${tournament.name}:`, error.message);
        } finally {
            await page.close();
        }
    }

    async addSampleGolfers() {
        const sampleGolfers = [
            { name: 'Scottie Scheffler', country: 'USA', worldRanking: 1, pgaWins: 12, majorWins: 2 },
            { name: 'Jon Rahm', country: 'ESP', worldRanking: 2, pgaWins: 9, majorWins: 2 },
            { name: 'Rory McIlroy', country: 'NIR', worldRanking: 3, pgaWins: 23, majorWins: 4 },
            { name: 'Patrick Cantlay', country: 'USA', worldRanking: 4, pgaWins: 8, majorWins: 0 },
            { name: 'Xander Schauffele', country: 'USA', worldRanking: 5, pgaWins: 6, majorWins: 2 },
            { name: 'Viktor Hovland', country: 'NOR', worldRanking: 6, pgaWins: 3, majorWins: 0 },
            { name: 'Collin Morikawa', country: 'USA', worldRanking: 7, pgaWins: 6, majorWins: 2 },
            { name: 'Wyndham Clark', country: 'USA', worldRanking: 8, pgaWins: 3, majorWins: 1 },
            { name: 'Justin Thomas', country: 'USA', worldRanking: 9, pgaWins: 15, majorWins: 2 },
            { name: 'Jordan Spieth', country: 'USA', worldRanking: 10, pgaWins: 13, majorWins: 3 },
            { name: 'Max Homa', country: 'USA', worldRanking: 11, pgaWins: 6, majorWins: 0 },
            { name: 'Jason Day', country: 'AUS', worldRanking: 12, pgaWins: 13, majorWins: 1 },
            { name: 'Brian Harman', country: 'USA', worldRanking: 13, pgaWins: 2, majorWins: 1 },
            { name: 'Russell Henley', country: 'USA', worldRanking: 14, pgaWins: 4, majorWins: 0 },
            { name: 'Tony Finau', country: 'USA', worldRanking: 15, pgaWins: 6, majorWins: 0 },
            { name: 'Matt Fitzpatrick', country: 'ENG', worldRanking: 16, pgaWins: 2, majorWins: 1 },
            { name: 'Hideki Matsuyama', country: 'JPN', worldRanking: 17, pgaWins: 8, majorWins: 1 },
            { name: 'Tommy Fleetwood', country: 'ENG', worldRanking: 18, pgaWins: 1, majorWins: 0 },
            { name: 'Shane Lowry', country: 'IRL', worldRanking: 19, pgaWins: 1, majorWins: 1 },
            { name: 'Tyrrell Hatton', country: 'ENG', worldRanking: 20, pgaWins: 1, majorWins: 0 }
        ];

        console.log('🏌️ Adding sample golfer data...');
        
        for (const golfer of sampleGolfers) {
            try {
                await query(`
                    INSERT INTO golfers (name, country, world_ranking, pga_tour_wins, major_wins, is_active) 
                    VALUES ($1, $2, $3, $4, $5, true)
                    ON CONFLICT (name) DO UPDATE SET
                        world_ranking = $3,
                        pga_tour_wins = $4,
                        major_wins = $5,
                        updated_at = CURRENT_TIMESTAMP
                `, [golfer.name, golfer.country, golfer.worldRanking, golfer.pgaWins, golfer.majorWins]);
            } catch (error) {
                console.error(`❌ Error adding ${golfer.name}:`, error.message);
            }
        }
        
        console.log('✅ Sample golfer data added');
    }

    async runManualUpdate() {
        console.log('🔄 Running manual scraping update...');
        await this.addSampleGolfers();
        await this.updateGolferRankings();
        await this.updateLiveScores();
    }

    async checkScrapingHealth() {
        try {
            const browser = await this.getBrowser();
            const page = await browser.newPage();
            
            await page.goto('https://www.espn.com/golf/', { timeout: 10000 });
            const title = await page.title();
            await page.close();
            
            return { 
                status: 'healthy', 
                message: 'Successfully connected to ESPN Golf',
                title: title
            };
        } catch (error) {
            return { 
                status: 'error', 
                message: error.message 
            };
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    // 👇 ADD ALL THE NEW METHODS HERE, BEFORE THE CLOSING BRACE

    async autoManageTournaments() {
        console.log('🔄 Running automatic tournament management...');
        
        try {
            // Step 1: Auto-activate tournaments that should be active
            await this.autoActivateTournaments();
            
            // Step 2: Detect and create missing tournaments
            await this.detectAndCreateTournaments();
            
            // Step 3: Deactivate completed tournaments
            await this.autoDeactivateTournaments();
            
        } catch (error) {
            console.error('❌ Auto tournament management failed:', error);
        }
    }

    async autoActivateTournaments() {
        try {
            const { query } = require('../config/database');
            
            // Activate tournaments that should be active but aren't
            const result = await query(`
                UPDATE tournaments 
                SET is_active = true, updated_at = CURRENT_TIMESTAMP
                WHERE is_active = false 
                AND start_date <= CURRENT_TIMESTAMP 
                AND end_date >= CURRENT_TIMESTAMP
                AND is_completed = false
                RETURNING name
            `);
            
            if (result.rows.length > 0) {
                console.log(`🟢 Auto-activated ${result.rows.length} tournaments:`);
                result.rows.forEach(t => console.log(`   • ${t.name}`));
            }
            
        } catch (error) {
            console.error('❌ Failed to auto-activate tournaments:', error);
        }
    }

    async autoDeactivateTournaments() {
        try {
            const { query } = require('../config/database');
            
            // Deactivate and mark as completed tournaments that are finished
            const result = await query(`
                UPDATE tournaments 
                SET is_active = false, is_completed = true, updated_at = CURRENT_TIMESTAMP
                WHERE is_active = true 
                AND end_date < CURRENT_TIMESTAMP
                RETURNING name
            `);
            
            if (result.rows.length > 0) {
                console.log(`🔴 Auto-completed ${result.rows.length} tournaments:`);
                result.rows.forEach(t => console.log(`   • ${t.name}`));
            }
            
        } catch (error) {
            console.error('❌ Failed to auto-deactivate tournaments:', error);
        }
    }

    async detectAndCreateTournaments() {
        let browser;
        try {
            console.log('🔍 Detecting current tournaments from ESPN...');
            
            browser = await this.getBrowser();
            const page = await browser.newPage();
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.goto('https://www.espn.com/golf/schedule', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Check if we can find tournament information
            const tournaments = await page.evaluate(() => {
                const tournamentElements = document.querySelectorAll('.Table__TR, .event-card, .schedule-item');
                const foundTournaments = [];
                
                for (const element of tournamentElements) {
                    const nameElement = element.querySelector('.event-name, .tournament-name, a[href*="tournament"]');
                    const dateElement = element.querySelector('.date, .event-date, .schedule-date');
                    
                    if (nameElement && dateElement) {
                        const name = nameElement.textContent?.trim();
                        const dateText = dateElement.textContent?.trim();
                        
                        if (name && dateText && name.length > 3) {
                            foundTournaments.push({
                                name: name,
                                dateText: dateText,
                                detected: true
                            });
                        }
                    }
                }
                
                return foundTournaments;
            });

            console.log(`🔍 Detected ${tournaments.length} tournaments from ESPN`);

            // Create missing tournaments
            for (const tournament of tournaments) {
                await this.createTournamentIfMissing(tournament);
            }

            await page.close();
            
        } catch (error) {
            console.error('❌ Tournament detection failed:', error);
        }
    }

    async createTournamentIfMissing(tournamentData) {
        try {
            const { query } = require('../config/database');
            
            // Check if tournament already exists
            const existing = await query(`
                SELECT id FROM tournaments 
                WHERE LOWER(name) LIKE LOWER($1) 
                OR LOWER($1) LIKE LOWER('%' || name || '%')
                LIMIT 1
            `, [tournamentData.name]);

            if (existing.rows.length === 0) {
                // Try to parse dates or use reasonable defaults
                const now = new Date();
                const startDate = new Date(); // Default to now
                const endDate = new Date(now.getTime() + (4 * 24 * 60 * 60 * 1000)); // +4 days

                const result = await query(`
                    INSERT INTO tournaments (
                        name, course_name, location, start_date, end_date, 
                        is_active, prize_fund, course_par
                    ) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id, name
                `, [
                    tournamentData.name,
                    'TBD', // Course name to be updated later
                    'TBD', // Location to be updated later  
                    startDate,
                    endDate,
                    true, // Start as active since it was detected as current
                    0, // Prize fund to be updated later
                    72 // Default par
                ]);

                console.log(`🆕 Auto-created tournament: ${result.rows[0].name}`);
                return result.rows[0].id;
            }
            
        } catch (error) {
            console.error(`❌ Failed to create tournament ${tournamentData.name}:`, error.message);
        }
    }

} 

module.exports = new ScrapingService();

