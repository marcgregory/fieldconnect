'use client';

import { useState } from 'react';
import { Input, Button } from '@fieldconnect/ui';
import type { CreateProjectInput, Project } from '@fieldconnect/shared';
import { createProject, updateProject } from '@/lib/api';

interface ProjectFormProps {
  project?: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

export function ProjectForm({ project, onClose, onSaved }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [address, setAddress] = useState(project?.address || '');
  const [contactName, setContactName] = useState(project?.contact_name || '');
  const [contactPhone, setContactPhone] = useState(project?.contact_phone || '');
  const [notes, setNotes] = useState(project?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const data: CreateProjectInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        contact_name: contactName.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      let result: Project;
      if (project) {
        result = await updateProject(project.id, data);
      } else {
        result = await createProject(data);
      }
      onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">
        {project ? 'Edit Project' : 'New Project'}
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Input
        label="Project Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Smith Residence - Low Voltage"
        required
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the project"
          rows={3}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <Input
        label="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="123 Main St, City, State"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Contact Name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Client contact"
        />
        <Input
          label="Contact Phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes"
          rows={2}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {project ? 'Save Changes' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
