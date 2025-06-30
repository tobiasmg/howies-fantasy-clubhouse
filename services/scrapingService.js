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

        // Update live scores every 15 minutes during active tournaments
        cron.schedule('*/15 * * * *', () => {
            this.updateLiveScores();
        });

        console.log('📅 Scraping cron jobs scheduled');
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
}

module.exports = new ScrapingService();
