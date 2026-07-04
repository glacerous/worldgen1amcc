ALTER TABLE buildings 
ADD COLUMN source TEXT NOT NULL DEFAULT 'team' CHECK (source IN ('team', 'community')),
ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;
