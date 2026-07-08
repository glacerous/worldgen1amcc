-- Add column short_label to audit_criteria table
ALTER TABLE audit_criteria ADD COLUMN IF NOT EXISTS short_label TEXT;

-- Update the existing 12 criteria with their short_label
UPDATE audit_criteria SET short_label = 'Ramp & Handrail' WHERE code = 'SNI-8201-M1';
UPDATE audit_criteria SET short_label = 'Lebar Pintu Masuk' WHERE code = 'SNI-8201-M2';
UPDATE audit_criteria SET short_label = 'Toilet Difabel' WHERE code = 'SNI-8201-M3';
UPDATE audit_criteria SET short_label = 'Elevator / Lift' WHERE code = 'SNI-8201-M4';
UPDATE audit_criteria SET short_label = 'Parkir Disabilitas' WHERE code = 'SNI-8201-M5';
UPDATE audit_criteria SET short_label = 'Ubin Pemandu' WHERE code = 'SNI-8201-N1';
UPDATE audit_criteria SET short_label = 'Kontras Tepi Tangga' WHERE code = 'SNI-8201-N2';
UPDATE audit_criteria SET short_label = 'Huruf Timbul & Braille' WHERE code = 'SNI-8201-N3';
UPDATE audit_criteria SET short_label = 'Peta Taktil Gedung' WHERE code = 'SNI-8201-N4';
UPDATE audit_criteria SET short_label = 'Signage Petunjuk Visual' WHERE code = 'SNI-8201-R1';
UPDATE audit_criteria SET short_label = 'Alarm Strobo Visual' WHERE code = 'SNI-8201-R2';
UPDATE audit_criteria SET short_label = 'Layar Informasi Digital' WHERE code = 'SNI-8201-R3';
