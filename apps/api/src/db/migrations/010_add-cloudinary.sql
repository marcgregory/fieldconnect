-- Add Cloudinary columns to job_attachments
ALTER TABLE job_attachments
  ADD COLUMN cloudinary_public_id VARCHAR(255),
  ADD COLUMN secure_url TEXT,
  ADD COLUMN resource_type VARCHAR(50);

-- Add Cloudinary columns to signatures
ALTER TABLE signatures
  ADD COLUMN cloudinary_public_id VARCHAR(255),
  ADD COLUMN secure_url TEXT;
