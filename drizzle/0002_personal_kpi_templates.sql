-- Migration: Add employee_id to kpi_templates for Personal Employee Templates
ALTER TABLE kpi_templates 
ADD COLUMN IF NOT EXISTS employee_id integer 
REFERENCES employees(id) ON DELETE SET NULL;

-- Create indices for fast lookup
CREATE INDEX IF NOT EXISTS idx_kpi_tpl_employee_id ON kpi_templates(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_tpl_is_custom ON kpi_templates(is_custom);
