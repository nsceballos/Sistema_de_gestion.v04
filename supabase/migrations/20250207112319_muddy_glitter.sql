/*
  # Fix DELETE policies for authenticated users

  1. Changes
    - Add DELETE policies for guests and reservations tables
    - Ensure CASCADE DELETE works properly

  2. Security
    - Enable DELETE operations for authenticated users
    - Maintain existing RLS policies
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON guests;

-- Create new DELETE policy for guests
CREATE POLICY "Enable delete for authenticated users" ON guests
  FOR DELETE TO authenticated
  USING (true);

-- Ensure referential integrity with CASCADE DELETE
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_guest_id_fkey,
  ADD CONSTRAINT reservations_guest_id_fkey 
  FOREIGN KEY (guest_id) 
  REFERENCES guests(id) 
  ON DELETE CASCADE;