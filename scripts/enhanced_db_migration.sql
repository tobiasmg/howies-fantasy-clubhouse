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
ALTER TABLE golfers 
ADD COLUMN IF NOT EXISTS current_ranking INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS owgr_points DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS events_played INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add indexes for better performance with 200+ players
CREATE INDEX IF NOT EXISTS idx_golfers_ranking ON golfers(current_ranking);
CREATE INDEX IF NOT EXISTS idx_golfers_country ON golfers(country);
CREATE INDEX IF NOT EXISTS idx_golfers_updated ON golfers(updated_at);
CREATE INDEX IF NOT EXISTS idx_scraping_logs_type ON scraping_logs(type, created_at);

-- Update golfers table to ensure name uniqueness for OWGR updates
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_golfer_name') THEN
        ALTER TABLE golfers ADD CONSTRAINT unique_golfer_name UNIQUE (name);
    END IF;
END $$;

-- Enhanced tournament_golfers table for live scoring
ALTER TABLE tournament_golfers 
ADD COLUMN IF NOT EXISTS round1_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS round2_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS round3_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS round4_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS position VARCHAR(10) DEFAULT 'CUT',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add index for tournament scoring lookups
CREATE INDEX IF NOT EXISTS idx_tournament_golfers_scoring ON tournament_golfers(tournament_id, total_score);

-- Create a view for current OWGR rankings
CREATE OR REPLACE VIEW current_owgr_rankings AS
SELECT 
    g.id,
    g.name,
    g.country,
    g.current_ranking,
    g.owgr_points,
    g.events_played,
    g.updated_at,
    CASE 
        WHEN g.current_ranking <= 10 THEN 'Top 10'
        WHEN g.current_ranking <= 50 THEN 'Top 50'
        WHEN g.current_ranking <= 100 THEN 'Top 100'
        ELSE 'Other'
    END as tier
FROM golfers g
WHERE g.current_ranking > 0
ORDER BY g.current_ranking;

-- Create a function to get player search results with ranking
CREATE OR REPLACE FUNCTION search_golfers(search_term VARCHAR(100))
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(255),
    country VARCHAR(50),
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
        g.current_ranking,
        g.owgr_points,
        CASE 
            WHEN g.current_ranking <= 10 THEN 'Top 10'
            WHEN g.current_ranking <= 50 THEN 'Top 50'
            WHEN g.current_ranking <= 100 THEN 'Top 100'
            ELSE 'Other'
        END as tier
    FROM golfers g
    WHERE 
        LOWER(g.name) LIKE LOWER('%' || search_term || '%')
        OR LOWER(g.country) LIKE LOWER('%' || search_term || '%')
    ORDER BY g.current_ranking NULLS LAST, g.name;
END;
$$ LANGUAGE plpgsql;

-- Update existing sample data with OWGR rankings (if it exists)
UPDATE golfers SET 
    current_ranking = CASE name
        WHEN 'Scottie Scheffler' THEN 1
        WHEN 'Xander Schauffele' THEN 2
        WHEN 'Rory McIlroy' THEN 3
        WHEN 'Collin Morikawa' THEN 4
        WHEN 'Viktor Hovland' THEN 5
        WHEN 'Ludvig Aberg' THEN 6
        WHEN 'Wyndham Clark' THEN 7
        WHEN 'JJ Spaun' THEN 8
        WHEN 'Patrick Cantlay' THEN 9
        WHEN 'Sahith Theegala' THEN 10
        WHEN 'Robert MacIntyre' THEN 12
        WHEN 'Bryson DeChambeau' THEN 13
        WHEN 'Max Homa' THEN 14
        WHEN 'Tony Finau' THEN 15
        ELSE current_ranking
    END,
    owgr_points = CASE name
        WHEN 'Scottie Scheffler' THEN 14.59
        WHEN 'Xander Schauffele' THEN 11.35
        WHEN 'Rory McIlroy' THEN 7.61
        WHEN 'Collin Morikawa' THEN 6.27
        WHEN 'Viktor Hovland' THEN 6.25
        WHEN 'Ludvig Aberg' THEN 5.34
        WHEN 'Wyndham Clark' THEN 5.06
        WHEN 'JJ Spaun' THEN 4.73
        WHEN 'Patrick Cantlay' THEN 4.63
        WHEN 'Sahith Theegala' THEN 4.05
        WHEN 'Robert MacIntyre' THEN 3.99
        WHEN 'Bryson DeChambeau' THEN 3.78
        WHEN 'Max Homa' THEN 3.67
        WHEN 'Tony Finau' THEN 3.46
        ELSE owgr_points
    END,
    updated_at = NOW()
WHERE name IN (
    'Scottie Scheffler', 'Xander Schauffele', 'Rory McIlroy', 'Collin Morikawa',
    'Viktor Hovland', 'Ludvig Aberg', 'Wyndham Clark', 'JJ Spaun',
    'Patrick Cantlay', 'Sahith Theegala', 'Robert MacIntyre', 'Bryson DeChambeau',
    'Max Homa', 'Tony Finau'
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

-- Show summary
SELECT 
    'Migration Complete' as status,
    COUNT(*) as total_golfers,
    COUNT(CASE WHEN current_ranking > 0 THEN 1 END) as ranked_golfers,
    COALESCE(MAX(current_ranking), 0) as lowest_ranking,
    COALESCE(MIN(NULLIF(current_ranking, 0)), 0) as highest_ranking
FROM golfers;
