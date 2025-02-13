/*
  # Initial Schema Setup

  1. New Tables
    - `guests`
      - Primary guest information including check-in/out dates, payments
    - `expenses`
      - Track expenses with categories and amounts
    - `reservations`
      - Link guests to their reservations and track status
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
    
  3. Indexes
    - Optimize queries with appropriate indexes
*/

-- Create guests table
CREATE TABLE IF NOT EXISTS guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  num_guests integer NOT NULL,
  phone_number text NOT NULL,
  num_nights integer NOT NULL,
  total_amount_usd numeric(10,2) NOT NULL,
  total_amount_ars numeric(10,2) NOT NULL,
  deposit_usd numeric(10,2) NOT NULL,
  deposit_ars numeric(10,2) NOT NULL,
  balance_usd numeric(10,2) GENERATED ALWAYS AS (total_amount_usd - deposit_usd) STORED,
  balance_ars numeric(10,2) GENERATED ALWAYS AS (total_amount_ars - deposit_ars) STORED,
  cabin_number integer NOT NULL DEFAULT 1,
  comments text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  category text NOT NULL,
  amount_usd numeric(10,2) NOT NULL,
  amount_ars numeric(10,2) NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid REFERENCES guests(id) ON DELETE CASCADE,
  status text NOT NULL,
  notification_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users" ON guests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON guests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON guests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON guests
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON expenses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON expenses
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON expenses
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON expenses
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON reservations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON reservations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON reservations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON reservations
  FOR DELETE TO authenticated USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_guests_dates ON guests(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_guests_cabin ON guests(cabin_number);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);