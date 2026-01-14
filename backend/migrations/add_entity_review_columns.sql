-- Migration: Add review status columns to entities table
-- Date: 2024
-- Description: Adds review_status, reviewed_at, reviewed_by, and review_notes columns to entities table

-- Add review status columns to entities table
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'not_reviewed',
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reviewed_by UUID,
ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add check constraint for review_status
ALTER TABLE entities
DROP CONSTRAINT IF EXISTS check_entity_review_status;

ALTER TABLE entities
ADD CONSTRAINT check_entity_review_status CHECK (review_status IN ('not_reviewed', 'accepted', 'rejected'));

-- Update existing entities to have 'not_reviewed' status if NULL
UPDATE entities
SET review_status = 'not_reviewed'
WHERE review_status IS NULL;

