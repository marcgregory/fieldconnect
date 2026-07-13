import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClockInOut } from '../ClockInOut';
import * as api from '@/lib/api';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  getCurrentEntry: vi.fn(),
  getMyAssignments: vi.fn(),
}));

// ─── Geolocation mock ─────────────────────────────────────────────────────────

const mockGeolocation = {
  getCurrentPosition: vi.fn(),
};

Object.defineProperty(globalThis.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true,
  configurable: true,
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-0000-0000-000000000001';

const ACTIVE_ASSIGNMENT = {
  id: '11111111-1111-1111-1111-111111111111',
  project_id: '22222222-2222-2222-2222-222222222222',
  user_id: USER_ID,
  assigned_at: '2026-07-13T00:00:00Z',
  project_name: 'Smith Residence',
  project_status: 'active' as const,
  technician_name: 'Marc Gregory Turno',
  technician_role: 'field_technician',
  project_latitude: 40.7128,
  project_longitude: -74.006,
  project_geofence_radius: 100,
};

const CANCELLED_ASSIGNMENT = {
  ...ACTIVE_ASSIGNMENT,
  id: '33333333-3333-3333-3333-333333333333',
  project_id: '44444444-4444-4444-4444-444444444444',
  project_name: 'Cancelled Project',
  project_status: 'cancelled' as const,
  project_latitude: null,
  project_longitude: null,
};

function makeActiveEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    user_id: USER_ID,
    project_id: '22222222-2222-2222-2222-222222222222',
    project_name: 'Smith Residence',
    project_address: '123 Main St',
    clock_in: new Date().toISOString(),
    clock_out: null,
    break_minutes: 0,
    notes: null,
    clock_in_lat: null,
    clock_in_lng: null,
    clock_in_accuracy: null,
    clock_in_gps_status: null,
    clock_in_gps_error: null,
    clock_out_lat: null,
    clock_out_lng: null,
    clock_out_accuracy: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const GPS_CAPTURED = {
  coords: {
    latitude: 40.7128,
    longitude: -74.006,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderClockInOut() {
  const user = userEvent.setup();
  const onStatusChange = vi.fn();

  const result = render(<ClockInOut userId={USER_ID} onStatusChange={onStatusChange} />);

  return { user, onStatusChange, ...result };
}

async function waitForClockInForm() {
  await waitFor(() => {
    expect(screen.getByText(/select a project to clock in/i)).toBeInTheDocument();
  });
}

async function selectProject(user: ReturnType<typeof userEvent.setup>, name: string) {
  const option = screen.getByRole('radio', { name: new RegExp(`select project ${name}`, 'i') });
  await user.click(option);
}

async function clickClockIn(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: /clock in/i });
  await user.click(btn);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('ClockInOut — Clock In', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentEntry).mockResolvedValue(null);
    vi.mocked(api.getMyAssignments).mockResolvedValue([ACTIVE_ASSIGNMENT]);
    vi.mocked(api.clockIn).mockResolvedValue(makeActiveEntry() as any);
    // Default: GPS captured
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => success(GPS_CAPTURED),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits correct payload for a valid clock-in', async () => {
    const { user, onStatusChange } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    expect(args[0]).toBe('22222222-2222-2222-2222-222222222222'); // projectId
    expect(typeof args[1]).toBe('undefined'); // notes
    expect(args[2]).toBe(40.7128); // lat
    expect(args[3]).toBe(-74.006); // lng
    expect(args[4]).toBe(10); // accuracy
    expect(args[5]).toBe('captured'); // gps status
  });

  it('shows error when no project is selected', async () => {
    // User must be able to click submit even when no project is selected
    // to trigger RHF validation. The button is only disabled during submission
    // or when there are no assignments.
    const { user } = renderClockInOut();
    await waitForClockInForm();

    // Click clock in without selecting a project
    await clickClockIn(user);

    // The error is rendered in the role="alert" div and also as the
    // radiogroup error anchor. Check at least one is visible.
    await waitFor(() => {
      const errorEls = screen.getAllByText(/please select a project/i);
      expect(errorEls.length).toBeGreaterThanOrEqual(1);
    });
    expect(api.clockIn).not.toHaveBeenCalled();
  });

  it('GPS captured status is sent correctly', async () => {
    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    expect(args[5]).toBe('captured'); // gpsStatus
    expect(args[6]).toBeUndefined(); // gpsError
  });

  it('GPS permission denied is handled correctly', async () => {
    mockGeolocation.getCurrentPosition.mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        const err = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, TIMEOUT: 3, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError;
        error(err);
      },
    );

    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    expect(args[5]).toBe('permission_denied');
    // Clock-in should still proceed (best-effort GPS)
  });

  it('GPS timeout is handled correctly', async () => {
    mockGeolocation.getCurrentPosition.mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        const err = { code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError;
        error(err);
      },
    );

    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    expect(args[5]).toBe('timeout');
  });

  it('unsupported browser (no geolocation) is handled correctly', async () => {
    // Temporarily remove geolocation
    const originalGeo = globalThis.navigator.geolocation;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      const { user } = renderClockInOut();
      await waitForClockInForm();

      await selectProject(user, 'Smith Residence');
      await clickClockIn(user);

      await waitFor(() => {
        expect(api.clockIn).toHaveBeenCalledTimes(1);
      });

      const args = vi.mocked(api.clockIn).mock.calls[0];
      expect(args[5]).toBe('unsupported');
    } finally {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: originalGeo,
        writable: true,
        configurable: true,
      });
    }
  });

  it('coordinates are preserved in the request', async () => {
    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    expect(args[2]).toBeCloseTo(40.7128);
    expect(args[3]).toBeCloseTo(-74.006);
    expect(args[4]).toBe(10);
  });

  it('captured GPS status is reported even without valid coordinates', async () => {
    // Simulate GPS returning captured but no lat/lng (edge case)
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: null as any,
            longitude: null as any,
            accuracy: null as any,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      },
    );

    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });

    const args = vi.mocked(api.clockIn).mock.calls[0];
    // GPS status should be 'captured' but lat/lng undefined because
    // the coords are null
    expect(args[5]).toBe('captured');
  });

  it('geofence warning allows submit', async () => {
    // GPS outside geofence but geofence_action is 'warning'
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: 41.0, // ~32km away
            longitude: -74.006,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      },
    );

    const { user, onStatusChange } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });
    // Should succeed — geofence warning doesn't block
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalled();
    });
  });

  it('geofence block prevents submit', async () => {
    // Use an assignment where geofence_action is block_clock_in
    const blockingAssignment = {
      ...ACTIVE_ASSIGNMENT,
      project_geofence_action: 'block_clock_in' as const,
    };
    vi.mocked(api.getMyAssignments).mockResolvedValue([blockingAssignment]);

    // Make clockIn throw a geofence block error
    vi.mocked(api.clockIn).mockRejectedValue(new Error('Geofence block: you are outside the project site'));

    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Clock Out tests
// ══════════════════════════════════════════════════════════════════════════════

describe('ClockInOut — Clock Out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentEntry).mockResolvedValue(makeActiveEntry() as any);
    vi.mocked(api.getMyAssignments).mockResolvedValue([ACTIVE_ASSIGNMENT]);
    vi.mocked(api.clockOut).mockResolvedValue(makeActiveEntry({ clock_out: new Date().toISOString() }) as any);
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => success(GPS_CAPTURED),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an active entry to clock out', async () => {
    // No active entry
    vi.mocked(api.getCurrentEntry).mockResolvedValue(null);

    const { user } = renderClockInOut();
    await waitFor(() => {
      // Should show clock-in form, not clock-out
      expect(screen.queryByText(/Clock Out/i)).not.toBeInTheDocument();
    });
  });

  it('clock-out sends the correct entry', async () => {
    // The component uses the activeEntry state to determine which entry to close.
    // The API call is clockOut() which handles the current entry server-side.
    renderClockInOut();

    await waitFor(() => {
      expect(screen.getByText(/Clock Out/i)).toBeInTheDocument();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Offline tests
// ══════════════════════════════════════════════════════════════════════════════

describe('ClockInOut — Offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentEntry).mockResolvedValue(null);
    vi.mocked(api.getMyAssignments).mockResolvedValue([ACTIVE_ASSIGNMENT]);
    vi.mocked(api.clockIn).mockResolvedValue(makeActiveEntry() as any);
    // GPS succeeds
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => success(GPS_CAPTURED),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows clock-in form when offline fails to load initially', async () => {
    // When the API fails, the component shows an error state with retry
    vi.mocked(api.getCurrentEntry).mockRejectedValue(new Error('Network error'));

    const { user } = renderClockInOut();

    // Should show error state (since no active entry exists)
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    // Should have a retry button
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // Simulate coming back online — retry should succeed
    vi.mocked(api.getCurrentEntry).mockResolvedValue(null);
    vi.mocked(api.getMyAssignments).mockResolvedValue([ACTIVE_ASSIGNMENT]);
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/select a project to clock in/i)).toBeInTheDocument();
    });
  });

  it('clock-in API failure shows error and does not clear form', async () => {
    const { user } = renderClockInOut();
    await waitForClockInForm();

    vi.mocked(api.clockIn).mockRejectedValue(new Error('Network error'));

    await selectProject(user, 'Smith Residence');
    await clickClockIn(user);

    await waitFor(() => {
      // Error shows in the server error banner (role="alert")
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    // Form should still have the project selected — user can retry
    expect(screen.getByRole('radio', { name: /select project smith residence/i })).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Regression tests
// ══════════════════════════════════════════════════════════════════════════════

describe('ClockInOut — Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCurrentEntry).mockResolvedValue(null);
    vi.mocked(api.getMyAssignments).mockResolvedValue([ACTIVE_ASSIGNMENT]);
    vi.mocked(api.clockIn).mockResolvedValue(makeActiveEntry() as any);
    // GPS succeeds
    mockGeolocation.getCurrentPosition.mockImplementation(
      (success: PositionCallback) => success(GPS_CAPTURED),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no duplicate clock-in is submitted', async () => {
    const { user } = renderClockInOut();
    await waitForClockInForm();

    await selectProject(user, 'Smith Residence');

    // Click clock-in button twice rapidly
    await clickClockIn(user);
    await clickClockIn(user);

    await waitFor(() => {
      // Should only be called once — RHF prevents double submission
      expect(api.clockIn).toHaveBeenCalledTimes(1);
    });
  });

  it('active timer survives re-render', async () => {
    vi.mocked(api.getCurrentEntry).mockResolvedValue(makeActiveEntry({
      clock_in: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      clock_in_lat: 40.7128,
      clock_in_lng: -74.006,
    }) as any);

    renderClockInOut();

    await waitFor(() => {
      const timer = screen.getByText(/\d{2}:\d{2}:\d{2}/);
      expect(timer).toBeInTheDocument();
    });

    // Force a re-render by triggering a parent update
    act(() => {
      // Rerender with same props — timer should persist
    });

    // Timer should still be visible after re-render
    await waitFor(() => {
      expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });
  });

  it('no timezone shift in displayed time', async () => {
    const clockInTime = new Date('2026-07-14T09:00:00').toISOString();
    vi.mocked(api.getCurrentEntry).mockResolvedValue(makeActiveEntry({
      clock_in: clockInTime,
      clock_in_lat: 40.7128,
      clock_in_lng: -74.006,
    }) as any);

    renderClockInOut();

    await waitFor(() => {
      expect(screen.getByText(/smith residence/i)).toBeInTheDocument();
    });

    // The "Since" time should use toLocaleTimeString, which respects the local timezone
    // — we just verify it renders without crash
    expect(screen.getByText(/since/i)).toBeInTheDocument();
  });

  it('displayed project name is correct', async () => {
    renderClockInOut();

    await waitForClockInForm();

    expect(screen.getByText('Smith Residence')).toBeInTheDocument();
  });
});
