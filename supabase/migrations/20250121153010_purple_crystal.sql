/*
  # Agregar gestión de cabañas

  1. Cambios
    - Agregar columna cabin_number a la tabla guests
    - Crear índice para búsquedas por cabaña
  
  2. Notas
    - Se mantiene la compatibilidad con datos existentes
    - Se optimiza el rendimiento de consultas por cabaña
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'guests' AND column_name = 'cabin_number'
  ) THEN
    ALTER TABLE guests ADD COLUMN cabin_number integer NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_guests_cabin ON guests(cabin_number);
  END IF;
END $$;