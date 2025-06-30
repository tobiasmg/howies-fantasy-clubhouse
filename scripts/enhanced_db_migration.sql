-- Enhanced database migration for OWGR integration
-- This adds support for 200+ players and scraping logs

-- Add scraping logs table
CREATE TABLE IF NOT EXISTS scraping_logs (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    message TEXT,
    players_updated INTEGER DEFAULT 0,
    scores_updated INTEGER DEFAULT 0,
    error_details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enhance golfers table for OWGR data
-- Note: world_ranking already exists in your schema, so we just add new fields
ALTER TABLE golfers 
ADD COLUMN IF NOT EXISTS owgr_points DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS events_played INTEGER DEFAULT 0;

-- Ensure updated_at exists (may already exist)
ALTER TABLE golfers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add indexes for better performance with 200+ players
CREATE INDEX IF NOT EXISTS idx_golfers_owgr_ranking ON golfers(world_ranking);
CREATE INDEX IF NOT EXISTS idx_golfers_owgr_points ON golfers(owgr_points);
CREATE INDEX IF NOT EXISTS idx_golfers_country ON golfers(country);
CREATE INDEX IF NOT EXISTS idx_golfers_updated ON golfers(updated_at);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_type ON scraping_logs(type, created_at);

-- Enhanced tournament_golfers table for live scoring
ALTER TABLE tournament_golfers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add index for tournament scoring lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_tournament_golfers_scoring ON tournament_golfers(tournament_id, total_score);

-- Create a view for current OWGR rankings
CREATE OR REPLACE VIEW current_owgr_rankings AS
SELECT 
    g.id,
    g.name,
    g.country,
    g.world_ranking as current_ranking,
    g.owgr_points,
    g.events_played,
    g.updated_at,
    CASE 
        WHEN g.world_ranking <= 10 AND g.world_ranking > 0 THEN 'Top 10'
        WHEN g.world_ranking <= 50 AND g.world_ranking > 0 THEN 'Top 50'
        WHEN g.world_ranking <= 100 AND g.world_ranking > 0 THEN 'Top 100'
        ELSE 'Other'
    END as tier
FROM golfers g
WHERE g.world_ranking > 0 AND g.world_ranking < 999
ORDER BY g.world_ranking;

-- Create a function to get player search results with ranking
CREATE OR REPLACE FUNCTION search_golfers(search_term VARCHAR(100))
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(255),
    country VARCHAR(100),
    current_ranking INTEGER,
    owgr_points DECIMAL(10,2),
    tier TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id,
        g.name,
        g.country,
        g.world_ranking as current_ranking,
        g.owgr_points,
        CASE 
            WHEN g.world_ranking <= 10 AND g.world_ranking > 0 THEN 'Top 10'
            WHEN g.world_ranking <= 50 AND g.world_ranking > 0 THEN 'Top 50'
            WHEN g.world_ranking <= 100 AND g.world_ranking > 0 THEN 'Top 100'
            ELSE 'Other'
        END as tier
    FROM golfers g
    WHERE 
        LOWER(g.name) LIKE LOWER('%' || search_term || '%')
        OR LOWER(g.country) LIKE LOWER('%' || search_term || '%')
    ORDER BY g.world_ranking NULLS LAST, g.name;
END;
$$ LANGUAGE plpgsql;

-- Update existing sample data with enhanced OWGR data (if it exists)
UPDATE golfers SET 
    owgr_points = CASE name
        WHEN 'Scottie Scheffler' THEN 14.59
        WHEN 'Jon Rahm' THEN 11.35
        WHEN 'Rory McIlroy' THEN 7.61
        WHEN 'Patrick Cantlay' THEN 6.27
        WHEN 'Xander Schauffele' THEN 6.25
        WHEN 'Viktor Hovland' THEN 5.34
        WHEN 'Collin Morikawa' THEN 5.06
        WHEN 'Wyndham Clark' THEN 4.73
        WHEN 'Justin Thomas' THEN 4.63
        WHEN 'Jordan Spieth' THEN 4.05
        WHEN 'Max Homa' THEN 3.99
        WHEN 'Jason Day' THEN 3.78
        WHEN 'Brian Harman' THEN 3.67
        WHEN 'Russell Henley' THEN 3.46
        WHEN 'Tony Finau' THEN 3.36
        ELSE owgr_points
    END,
    events_played = CASE name
        WHEN 'Scottie Scheffler' THEN 41
        WHEN 'Jon Rahm' THEN 35
        WHEN 'Rory McIlroy' THEN 39
        WHEN 'Patrick Cantlay' THEN 42
        WHEN 'Xander Schauffele' THEN 44
        WHEN 'Viktor Hovland' THEN 46
        WHEN 'Collin Morikawa' THEN 45
        WHEN 'Wyndham Clark' THEN 42
        WHEN 'Justin Thomas' THEN 55
        WHEN 'Jordan Spieth' THEN 49
        WHEN 'Max Homa' THEN 40
        WHEN 'Jason Day' THEN 45
        WHEN 'Brian Harman' THEN 51
        WHEN 'Russell Henley' THEN 38
        WHEN 'Tony Finau' THEN 46
        ELSE events_played
    END,
    updated_at = NOW()
WHERE name IN (
    'Scottie Scheffler', 'Jon Rahm', 'Rory McIlroy', 'Patrick Cantlay',
    'Xander Schauffele', 'Viktor Hovland', 'Collin Morikawa', 'Wyndham Clark',
    'Justin Thomas', 'Jordan Spieth', 'Max Homa', 'Jason Day',
    'Brian Harman', 'Russell Henley', 'Tony Finau'
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_golfer_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS golfer_update_timestamp ON golfers;
CREATE TRIGGER golfer_update_timestamp
    BEFORE UPDATE ON golfers
    FOR EACH ROW
    EXECUTE FUNCTION update_golfer_timestamp();

-- Log the migration
INSERT INTO scraping_logs (type, status, message, created_at)
VALUES ('migration', 'success', 'Enhanced database schema for OWGR integration', NOW());

-- Show summary of what we have
SELECT 
    'Migration Complete' as status,
    COUNT(*) as total_golfers,
    COUNT(CASE WHEN world_ranking > 0 AND world_ranking < 999 THEN 1 END) as ranked_golfers,
    COALESCE(MAX(world_ranking), 0) as lowest_ranking,
    COALESCE(MIN(NULLIF(world_ranking, 0)), 0) as highest_ranking,
    COUNT(CASE WHEN owgr_points > 0 THEN 1 END) as golfers_with_owgr_points
FROM golfers;
