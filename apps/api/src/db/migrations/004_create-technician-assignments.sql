-- Create technician_assignments table to link field techs to projects

CREATE TABLE technician_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_assignments_user ON technician_assignments(user_id);
CREATE INDEX idx_assignments_project ON technician_assignments(project_id);
