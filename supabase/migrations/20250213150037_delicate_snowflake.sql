-- Ensure proper cascade deletion
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_guest_id_fkey,
  ADD CONSTRAINT reservations_guest_id_fkey 
  FOREIGN KEY (guest_id) 
  REFERENCES guests(id) 
  ON DELETE CASCADE;

-- Add index for faster deletion operations
CREATE INDEX IF NOT EXISTS idx_reservations_guest_delete ON reservations(guest_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for guests table
DROP TRIGGER IF EXISTS update_guests_updated_at ON guests;
CREATE TRIGGER update_guests_updated_at
    BEFORE UPDATE ON guests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for reservations table
DROP TRIGGER IF EXISTS update_reservations_updated_at ON reservations;
CREATE TRIGGER update_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();