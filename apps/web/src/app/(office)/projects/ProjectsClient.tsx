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

  const { lastJobEvent, lastEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent } = useSocket();
  useEffect(() => {
    if (!lastJobEvent && !lastEvent && !lastNoteEvent && !lastAttachmentEvent && !lastSignatureEvent) return;
    fetchProjects();
  }, [lastJobEvent, lastEvent, lastNoteEvent, lastAttachmentEvent, lastSignatureEvent, fetchProjects]);

  async function handleStatusChange(projectId: string, newStatus: ProjectStatus) {
    try {
      const updated = await updateProjectStatus(projectId, newStatus);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)));
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
    } catch {
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

  const filterTabs = [
    { value: 'all' as 'all' | ProjectStatus, label: 'All' },
    ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
            + New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-5 lg:col-span-2 lg:space-y-6">
            <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2 px-1 sm:flex-wrap sm:px-0">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                      statusFilter === tab.value
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
                <button onClick={fetchProjects} className="ml-2 underline">
                  Retry
                </button>
              </div>
            )}

            {loading && (
              <div className="py-12 text-center text-gray-500">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                <p className="text-sm">Loading projects...</p>
              </div>
            )}

            {!loading && !error && projects.length === 0 && (
              <div className="py-12 text-center">
                <p className="mb-4 text-gray-500">No projects found</p>
                <Button onClick={() => setShowForm(true)}>Create your first project</Button>
              </div>
            )}

            {!loading &&
              projects.map((project) => (
                <Card key={project.id} className="transition-shadow hover:shadow-md">
                  <div className="flex flex-col gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-gray-900">{project.name}</h3>
                            {getStatusBadge(project.status)}
                          </div>
                          {project.description && (
                            <p className="mt-2 text-sm leading-6 text-gray-600">{project.description}</p>
                          )}
                        </div>
                        <div className="w-full sm:w-auto">
                          <select
                            value={project.status}
                            onChange={(e) => handleStatusChange(project.id, e.target.value as ProjectStatus)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1 text-sm text-gray-500">
                        {project.address && <p className="break-words">📍 {project.address}</p>}
                        {project.contact_name && (
                          <p className="break-words">👤 {project.contact_name}{project.contact_phone ? ` — ${project.contact_phone}` : ''}</p>
                        )}
                      </div>

                      {assignments[project.id]?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assignments[project.id].map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                            >
                              {a.technician_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center"
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
                        className="w-full justify-center"
                        onClick={() => openAssignDialog(project.id)}
                      >
                        Manage Team
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
          </div>

          <div className="lg:col-span-1">
            <LiveStatusFeed />
          </div>
        </div>
      </main>

      {(showForm || editingProject) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6">
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

      {assigningProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl sm:p-6">
            <h2 className="mb-1 text-xl font-semibold text-gray-900">Manage Project Team</h2>
            <p className="mb-4 text-sm text-gray-500">
              Project team members are eligible to be scheduled. Actual work time is assigned in Schedule.
            </p>

            {assignments[assigningProject]?.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-gray-700">Project Team Members:</p>
                <div className="space-y-2">
                  {assignments[assigningProject].map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-sm text-gray-700">{a.technician_name}</span>
                        <span className="ml-2 text-xs text-gray-500">{a.technician_role}</span>
                      </div>
                      <button
                        onClick={() => handleRemove(a.user_id)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mb-2 text-sm font-medium text-gray-700">All Technicians:</p>
            {availableTechs.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No technicians available. Create a field_technician user first.
              </p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {availableTechs
                  .filter((tech) => !assignments[assigningProject]?.some((a) => a.user_id === tech.id))
                  .map((tech) => (
                    <div
                      key={tech.id}
                      className="flex flex-col gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{tech.name}</p>
                        <p className="break-all text-xs text-gray-500">{tech.email}</p>
                      </div>
                      <Button size="sm" className="w-full sm:w-auto" onClick={() => handleAssign(tech.id)}>
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