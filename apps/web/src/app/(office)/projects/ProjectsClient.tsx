'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card } from '@fieldconnect/ui';
import { ProjectForm } from '@/components/office/ProjectForm';
import { LiveStatusFeed } from '@/components/office/LiveStatusFeed';
import { useSocket } from '@/hooks/useSocket';
import {
  getProjects,
  updateProjectStatus,
  getAvailableTechnicians,
  assignTechnician,
  getProjectAssignments,
  removeTeamMember,
} from '@/lib/api';
import type {
  Project,
  ProjectStatus,
  TechnicianAssignmentWithDetails,
  TechnicianAvailability,
} from '@fieldconnect/shared';

const STATUS_OPTIONS: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'on_hold', label: 'On Hold', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
];

export function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [assigningProject, setAssigningProject] = useState<string | null>(null);
  const [availableTechs, setAvailableTechs] = useState<TechnicianAvailability[]>([]);
  const [assignments, setAssignments] = useState<Record<string, TechnicianAssignmentWithDetails[]>>({});

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProjects(
        statusFilter !== 'all' ? { status: statusFilter } : undefined,
      );
      setProjects(data);

      // Load assignments for all projects
      const allAssignments: Record<string, TechnicianAssignmentWithDetails[]> = {};
      await Promise.all(data.map(async (project) => {
        try {
          const projectAssignments = await getProjectAssignments(project.id);
          allAssignments[project.id] = projectAssignments;
        } catch {
          allAssignments[project.id] = [];
        }
      }));
      setAssignments(allAssignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ─── Socket: refetch on any activity event ───────────────────────────────
  const { lastJobEvent, lastEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent } = useSocket();
  useEffect(() => {
    if (!lastJobEvent && !lastEvent && !lastNoteEvent && !lastAttachmentEvent && !lastSignatureEvent) return;
    fetchProjects();
  }, [lastJobEvent, lastEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent, fetchProjects]);

  async function handleStatusChange(projectId: string, newStatus: ProjectStatus) {
    try {
      const updated = await updateProjectStatus(projectId, newStatus);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? updated : p)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  function handleSaved(project: Project) {
    setShowForm(false);
    setEditingProject(null);
    fetchProjects();
  }

  async function openAssignDialog(projectId: string) {
    setAssigningProject(projectId);
    try {
      const [techs, projectAssignments] = await Promise.all([
        getAvailableTechnicians(),
        getProjectAssignments(projectId),
      ]);
      setAvailableTechs(techs);
      setAssignments((prev) => ({ ...prev, [projectId]: projectAssignments }));
    } catch (err) {
      alert('Failed to load technicians');
      setAssigningProject(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!assigningProject) return;
    try {
      await removeTeamMember(assigningProject, userId);
      const updated = await getProjectAssignments(assigningProject);
      setAssignments((prev) => ({ ...prev, [assigningProject]: updated }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove team member');
    }
  }

  async function handleAssign(userId: string) {
    if (!assigningProject) return;
    try {
      await assignTechnician(assigningProject, userId);
      // Refresh assignments
      const updated = await getProjectAssignments(assigningProject);
      setAssignments((prev) => ({ ...prev, [assigningProject]: updated }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to assign technician');
    }
  }

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((s) => s.value === status);
    if (!opt) return null;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>
        {opt.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            + New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Projects List */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Filter Tabs */}
            <div className="flex gap-2">
              {[
                { value: 'all' as 'all' | ProjectStatus, label: 'All' },
                ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === tab.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
                <button onClick={fetchProjects} className="ml-2 underline">
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="text-center py-12 text-gray-500">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm">Loading projects...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && projects.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No projects found</p>
                <Button onClick={() => setShowForm(true)}>Create your first project</Button>
              </div>
            )}

            {/* Project Cards */}
            {!loading &&
              projects.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {project.name}
                        </h3>
                        {getStatusBadge(project.status)}
                      </div>

                      {project.description && (
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                          {project.description}
                        </p>
                      )}

                      <div className="text-sm text-gray-500 space-y-1">
                        {project.address && (
                          <p>📍 {project.address}</p>
                        )}
                        {project.contact_name && (
                          <p>👤 {project.contact_name}{project.contact_phone ? ` — ${project.contact_phone}` : ''}</p>
                        )}
                      </div>

                      {/* Assigned Technicians */}
                      {assignments[project.id]?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assignments[project.id].map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
                            >
                              {a.technician_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 ml-4">
                      <select
                        value={project.status}
                        onChange={(e) =>
                          handleStatusChange(project.id, e.target.value as ProjectStatus)
                        }
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingProject(project);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAssignDialog(project.id)}
                      >
                        Manage Team
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
          </div>

          {/* Sidebar: Live Feed */}
          <div className="lg:col-span-1">
            <LiveStatusFeed />
          </div>
        </div>
      </main>

      {/* Create/Edit Modal */}
      {(showForm || editingProject) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <ProjectForm
              project={editingProject}
              onClose={() => {
                setShowForm(false);
                setEditingProject(null);
              }}
              onSaved={handleSaved}
            />
          </div>
        </div>
      )}

      {/* Manage Team Modal */}
      {assigningProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              Manage Project Team
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Project team members are eligible to be scheduled. Actual work time is assigned in Schedule.
            </p>

            {/* Current Team Members */}
            {assignments[assigningProject]?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Project Team Members:</p>
                <div className="space-y-2">
                  {assignments[assigningProject].map((a) => (
                    <div key={a.id} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg">
                      <div>
                        <span className="text-sm text-gray-700">{a.technician_name}</span>
                        <span className="text-xs text-gray-500 ml-2">{a.technician_role}</span>
                      </div>
                      <button
                        onClick={() => handleRemove(a.user_id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Technicians */}
            <p className="text-sm font-medium text-gray-700 mb-2">All Technicians:</p>
            {availableTechs.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No technicians available. Create a field_technician user first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableTechs
                  .filter((tech) => !assignments[assigningProject]?.some(
                    (a) => a.user_id === tech.id,
                  ))
                  .map((tech) => (
                    <div
                      key={tech.id}
                      className="flex justify-between items-center px-3 py-2 rounded-lg hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{tech.name}</p>
                        <p className="text-xs text-gray-500">{tech.email}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAssign(tech.id)}
                      >
                        Add to Team
                      </Button>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setAssigningProject(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

