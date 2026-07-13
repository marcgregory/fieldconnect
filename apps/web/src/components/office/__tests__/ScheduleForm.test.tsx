import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleForm } from '../ScheduleForm';
import * as api from '@/lib/api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  getProjects: vi.fn(),
  getAvailableTechnicians: vi.fn(),
  getProjectAssignments: vi.fn(),
}));

const ACTIVE_PROJECT = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Smith Residence',
  status: 'active' as const,
  description: null,
  address: null,
  contact_name: null,
  contact_phone: null,
  notes: null,
  latitude: null,
  longitude: null,
  geofence_radius: 50,
  geofence_action: 'warning' as const,
  created_by: '00000000-0000-0000-0000-000000000001',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const ACTIVE_PROJECT_2 = {
  ...ACTIVE_PROJECT,
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Johnson Office Park',
};

const TEAM_MEMBERS = [
  { id: '00000000-0000-0000-0000-000000000001', user_id: '00000000-0000-0000-0000-000000000001' },
  { id: '00000000-0000-0000-0000-000000000002', user_id: '00000000-0000-0000-0000-000000000002' },
];

const TECH_1: any = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'marc@example.com',
  name: 'Marc Gregory Turno',
  role: 'field_technician',
  availability: 'available',
  conflict_schedule: null,
};

const TECH_2: any = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'princess@example.com',
  name: 'Princess Turno',
  role: 'field_technician',
  availability: 'available',
  conflict_schedule: null,
};

const TECH_BUSY: any = {
  id: '00000000-0000-0000-0000-000000000003',
  email: 'busy@example.com',
  name: 'Busy Tech',
  role: 'field_technician',
  availability: 'busy',
  conflict_schedule: { project_name: 'Other Job', start_time: '09:00', end_time: '11:00' },
};

const DEFAULT_PROPS = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

function renderForm(props: Partial<typeof DEFAULT_PROPS & { schedule?: any; defaultDate?: string | null; defaultTime?: string | null; onDelete?: any }> = {}, overrides?: { projectAssignments?: any[] }) {
  const user = userEvent.setup();
  const onSaved = props.onSaved ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();

  // Clear active mocks before each render
  vi.mocked(api.getProjects).mockResolvedValue([ACTIVE_PROJECT, ACTIVE_PROJECT_2]);
  vi.mocked(api.getProjectAssignments).mockResolvedValue(overrides?.projectAssignments ?? TEAM_MEMBERS);
  vi.mocked(api.getAvailableTechnicians).mockResolvedValue([TECH_1, TECH_2, TECH_BUSY]);

  const result = render(
    <ScheduleForm
      schedule={props.schedule ?? null}
      defaultDate={props.defaultDate ?? null}
      defaultTime={props.defaultTime ?? null}
      onClose={onClose}
      onSaved={onSaved}
      onDelete={props.onDelete}
    />,
  );

  return { user, onSaved, onClose, ...result };
}

async function selectProject(user: ReturnType<typeof userEvent.setup>, name: string) {
  await waitFor(() => {
    expect(screen.getByRole('option', { name })).toBeInTheDocument();
  });
  const projectSelect = screen.getByRole('combobox', { name: /project/i }) as HTMLSelectElement;
  // Find the option by its visible name, then use selectOptions with its value
  const opt = screen.getByRole('option', { name }) as HTMLOptionElement;
  await user.selectOptions(projectSelect, opt.value);
  // Wait for team members / technician filter to update
  await waitFor(() => {
    expect(screen.queryByText(/select a project first/i)).not.toBeInTheDocument();
  });
}

async function selectTechnician(user: ReturnType<typeof userEvent.setup>, name: string) {
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: new RegExp(name, 'i') })).toBeInTheDocument();
  });
  const checkbox = screen.getByRole('checkbox', { name: new RegExp(name, 'i') });
  await user.click(checkbox);
}

async function fillTime(user: ReturnType<typeof userEvent.setup>, field: 'start' | 'end', value: string) {
  const input = screen.getByLabelText(new RegExp(`${field} time`, 'i'));
  await user.clear(input);
  await user.type(input, value);
}

function getSubmitButton() {
  return screen.getByRole('button', { name: /(create schedule|update schedule)/i });
}

// ─── Helper: schedule fixture ─────────────────────────────────────────────────

function makeSchedule(overrides: Record<string, any> = {}): any {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    project_id: '00000000-0000-0000-0000-000000000001',
    project_name: 'Smith Residence',
    project_address: null,
    project_contact_name: null,
    project_contact_phone: null,
    technician_name: 'Marc Gregory Turno',
    technician_ids: ['00000000-0000-0000-0000-000000000001'],
    technician_names: ['Marc Gregory Turno'],
    technician_workflow: [
      { technician_id: '00000000-0000-0000-0000-000000000001', technician_name: 'Marc Gregory Turno', status: 'scheduled', completed_at: null, closed_at: null, current_rework_version: 0, has_open_rework: false },
    ],
    scheduled_date: '2026-07-15',
    start_time: '09:00:00',
    end_time: '17:00:00',
    status: 'scheduled',
    notes: 'Initial notes',
    created_by: 'user-admin',
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    note_count: 0,
    attachment_count: 0,
    signature_count: 0,
    ...overrides,
  };
}

// ─── Tests: Create ────────────────────────────────────────────────────────────

describe('ScheduleForm — Create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits correct payload for a valid schedule', async () => {
    const { user, onSaved } = renderForm();

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');

    const dateInput = screen.getByLabelText(/date/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-07-20');

    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '17:00');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const payload = onSaved.mock.calls[0][0];
    expect(payload).toMatchObject({
      project_id: '00000000-0000-0000-0000-000000000001',
      technician_ids: ['00000000-0000-0000-0000-000000000001'],
      scheduled_date: '2026-07-20',
      start_time: '09:00',
      end_time: '17:00',
    });
    expect(payload).not.toHaveProperty('id');
  });

  it('shows error when no technician is selected', async () => {
    const { user, onSaved } = renderForm();

    await selectProject(user, 'Smith Residence');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText(/at least one technician required/i)).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows error when start time is before 6:00 AM', async () => {
    const { user, onSaved } = renderForm();

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');
    await fillTime(user, 'start', '05:00');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText(/cannot start before 6:00 am/i)).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows error when end time <= start time', async () => {
    const { user, onSaved } = renderForm();

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');
    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '09:00');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('loads only active projects', async () => {
    renderForm();

    await waitFor(() => {
      expect(api.getProjects).toHaveBeenCalledWith({ status: 'active' });
    });
  });

  it('shows message when project has no team members', async () => {
    const { user } = renderForm({}, { projectAssignments: [] });

    await selectProject(user, 'Smith Residence');

    await waitFor(() => {
      expect(
        screen.getByText(/no technicians assigned to this project team/i),
      ).toBeInTheDocument();
    });
  });
});

// ─── Tests: Edit ──────────────────────────────────────────────────────────────

describe('ScheduleForm — Edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills existing schedule values', async () => {
    const schedule = makeSchedule();
    renderForm({ schedule });

    await waitFor(() => {
      const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
      expect(dateInput.value).toBe('2026-07-15');
    });

    const startInput = screen.getByLabelText(/start time/i) as HTMLInputElement;
    expect(startInput.value).toBe('09:00');

    const endInput = screen.getByLabelText(/end time/i) as HTMLInputElement;
    expect(endInput.value).toBe('17:00');

    const notesInput = screen.getByLabelText(/notes/i) as HTMLTextAreaElement;
    expect(notesInput.value).toBe('Initial notes');

    const projectSelect = screen.getByRole('combobox', { name: /project/i }) as HTMLSelectElement;
    expect(projectSelect.value).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('preserves existing technician status when adding a technician', async () => {
    const schedule = makeSchedule();
    const { user, onSaved } = renderForm({ schedule });

    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    // Add a second technician
    await selectTechnician(user, 'Princess Turno');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const payload = onSaved.mock.calls[0][0];
    expect(payload.technician_ids).toEqual(['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']);
    expect(payload).toHaveProperty('id', '22222222-2222-2222-2222-222222222222');
  });

  it('blocks removing an active (traveling/on_site) technician', async () => {
    const schedule = makeSchedule({
      technician_ids: ['00000000-0000-0000-0000-000000000001'],
      technician_workflow: [
        {
          technician_id: '00000000-0000-0000-0000-000000000001',
          technician_name: 'Marc Gregory Turno',
          status: 'on_site',
          completed_at: null,
          closed_at: null,
          current_rework_version: 0,
          has_open_rework: false,
        },
      ],
    });
    renderForm({ schedule });

    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox', { name: /marc gregory turno/i });
      expect(checkbox).toBeDisabled();
    });
  });

  it('allows removing a scheduled technician', async () => {
    const schedule = makeSchedule({
      technician_ids: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
      technician_workflow: [
        {
          technician_id: '00000000-0000-0000-0000-000000000001',
          technician_name: 'Marc Gregory Turno',
          status: 'scheduled',
          completed_at: null,
          closed_at: null,
          current_rework_version: 0,
          has_open_rework: false,
        },
        {
          technician_id: '00000000-0000-0000-0000-000000000002',
          technician_name: 'Princess Turno',
          status: 'scheduled',
          completed_at: null,
          closed_at: null,
          current_rework_version: 0,
          has_open_rework: false,
        },
      ],
    });
    const { user, onSaved } = renderForm({ schedule });

    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    // Remove the second technician
    await selectTechnician(user, 'Princess Turno');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const payload = onSaved.mock.calls[0][0];
    expect(payload.technician_ids).toEqual(['00000000-0000-0000-0000-000000000001']);
  });

  it('does not recreate unchanged technicians on save', async () => {
    const schedule = makeSchedule();
    const { user, onSaved } = renderForm({ schedule });

    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    // Submit without changes
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const payload = onSaved.mock.calls[0][0];
    expect(payload.technician_ids).toEqual(['00000000-0000-0000-0000-000000000001']);
    expect(payload).not.toHaveProperty('force');
  });
});

// ─── Tests: Conflict ──────────────────────────────────────────────────────────

describe('ScheduleForm — Conflict', () => {
  const CONFLICT_ERROR: any = new Error('Schedule conflicts detected');
  CONFLICT_ERROR.can_force_assign = true;
  CONFLICT_ERROR.conflicts = [
    {
      technician_name: 'Marc Gregory Turno',
      project_name: 'Johnson Office Park',
      start_time: '10:00:00',
      end_time: '12:00:00',
      conflict_type: 'overlap',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays conflict dialog on 409 with conflicts', async () => {
    const { user, onSaved } = renderForm();
    onSaved.mockRejectedValue(CONFLICT_ERROR);

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');

    const dateInput = screen.getByLabelText(/date/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-07-20');

    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '17:00');

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /schedule conflicts/i })).toBeInTheDocument();
    });
    // Find the dialog overlay and check content inside it
    const dialog = document.querySelector('.fixed.z-50')!;
    expect(dialog).toHaveTextContent(/marc gregory turno/i);
    expect(dialog).toHaveTextContent(/johnson office park/i);
    expect(dialog).toHaveTextContent(/10:00 AM.*12:00 PM/i);
  });

  it('does not show "undefined" in conflict messages', async () => {
    const { user, onSaved } = renderForm();
    onSaved.mockRejectedValue(CONFLICT_ERROR);

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');
    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '17:00');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /schedule conflicts/i })).toBeInTheDocument();
    });

    const dialog = document.querySelector('.fixed.z-50')!;
    expect(dialog.textContent).not.toContain('undefined');
  });

  it('does not submit when cancel is clicked on conflict dialog', async () => {
    const { user, onSaved } = renderForm();
    onSaved.mockRejectedValue(CONFLICT_ERROR);

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');
    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '17:00');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /schedule conflicts/i })).toBeInTheDocument();
    });

    // Clear the mock call count — previous call was the rejected one
    onSaved.mockClear();

    // Click the Cancel button in the conflict dialog overlay
    // The conflict dialog is the .fixed.z-50 element
    const overlay = document.querySelector('.fixed.z-50')!;
    // The cancel button is the first button in the dialog footer
    const buttons = overlay.querySelectorAll('.rounded-xl button');
    // Last two buttons are Cancel + Force Assign in the footer
    const cancelBtn = buttons[buttons.length - 2] as HTMLElement;
    if (cancelBtn.textContent?.trim() !== 'Cancel') {
      throw new Error('Expected Cancel button not found');
    }
    await user.click(cancelBtn);

    // Wait briefly — should not call onSaved after cancel
    await new Promise((r) => setTimeout(r, 100));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('submits exactly once when force assign is confirmed', async () => {
    const { user, onSaved } = renderForm();
    onSaved.mockRejectedValueOnce(CONFLICT_ERROR);
    onSaved.mockResolvedValueOnce(undefined);

    await selectProject(user, 'Smith Residence');
    await selectTechnician(user, 'Marc Gregory Turno');
    await fillTime(user, 'start', '09:00');
    await fillTime(user, 'end', '17:00');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /schedule conflicts/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /force assign/i }));

    await waitFor(() => {
      // Once for the initial submit (rejected), once for force assign (resolved)
      expect(onSaved).toHaveBeenCalledTimes(2);
    });

    const forcePayload = onSaved.mock.calls[1][0];
    expect(forcePayload.force).toBe(true);
  });
});

// ─── Tests: Regression ────────────────────────────────────────────────────────

describe('ScheduleForm — Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('multi-technician edit does not reset workflow state', async () => {
    const schedule = makeSchedule({
      technician_ids: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
      technician_names: ['Marc Gregory Turno', 'Princess Turno'],
      technician_workflow: [
        {
          technician_id: '00000000-0000-0000-0000-000000000001',
          technician_name: 'Marc Gregory Turno',
          status: 'scheduled',
          completed_at: null,
          closed_at: null,
          current_rework_version: 0,
          has_open_rework: false,
        },
        {
          technician_id: '00000000-0000-0000-0000-000000000002',
          technician_name: 'Princess Turno',
          status: 'on_site',
          completed_at: null,
          closed_at: null,
          current_rework_version: 0,
          has_open_rework: false,
        },
      ],
    });
    renderForm({ schedule });

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox');
      // Princess (on_site) should be disabled
      const princessCheckbox = screen.getByRole('checkbox', { name: /princess turno/i }) as HTMLInputElement;
      expect(princessCheckbox).toBeDisabled();
      // Marc (scheduled) should be enabled
      const marcCheckbox = screen.getByRole('checkbox', { name: /marc gregory turno/i }) as HTMLInputElement;
      expect(marcCheckbox).not.toBeDisabled();
    });
  });

  it('date/time values do not shift because of timezone parsing', async () => {
    const schedule = makeSchedule();
    const { user, onSaved } = renderForm({ schedule });

    await waitFor(() => {
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    });

    // Simply verify the pre-filled values are exactly as in the schedule
    const dateInput = screen.getByLabelText(/date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('2026-07-15');

    const startInput = screen.getByLabelText(/start time/i) as HTMLInputElement;
    expect(startInput.value).toBe('09:00');

    // Submit unchanged should send original values
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const payload = onSaved.mock.calls[0][0];
    expect(payload.scheduled_date).toBe('2026-07-15');
    expect(payload.start_time).toBe('09:00');
  });
});
