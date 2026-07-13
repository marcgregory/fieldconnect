# GPS Status Pipeline Fix Plan

## Root Cause

The `clock_in_lat` and `clock_in_lng` fields are nullable, but there is **no stored distinction** between:
- Geolocation permission denied
- Geolocation timed out
- Position unavailable 
- Browser doesn't support geolocation
- Clock-in submitted without GPS (frontend bug)
- GPS data lost in API/db pipeline

The UI currently claims "the device or browser did not provide a location" which is misleading — the failure could be anywhere in the pipeline.

## Changes

### 1. Frontend: ClockInOut.tsx — Send gps_status with every clock-in

**`getCurrentPosition()`** currently returns `null` on failure with only a `console.warn`. Change it to return the **failure reason** in a structured object:

```ts
// Return type
{ lat, lng, accuracy, gpsStatus: 'captured' | 'permission_denied' | 'timeout' | 'position_unavailable' | 'unsupported' } | null
```

Where:
- `captured` — coordinates obtained
- `permission_denied` — `GeolocationPositionError.PERMISSION_DENIED` (`error.code === 1`)
- `timeout` — `GeolocationPositionError.TIMEOUT` (`error.code === 3`)
- `position_unavailable` — `GeolocationPositionError.POSITION_UNAVAILABLE` (`error.code === 2`)
- `unsupported` — `!navigator.geolocation`

Pass `gpsStatus` to `clockIn()`.

### 2. Schema: clockInSchema — Add clock_in_gps_status field

```ts
clock_in_gps_status: z.enum([
  'captured', 'permission_denied', 'timeout', 
  'position_unavailable', 'unsupported', 'omitted'
]).optional()
```

Include `clock_in_gps_error: z.string().max(500).optional()` for safe error text.

### 3. Migration 034: Add columns to time_entries table

```sql
ALTER TABLE time_entries
  ADD COLUMN clock_in_gps_status VARCHAR(30),
  ADD COLUMN clock_in_gps_error VARCHAR(500);
```

### 4. API clock-in route — Accept and store gps_status

The route handler receives `clock_in_gps_status` from parsed body and passes it to `timeEntryQueries.clockIn()`.

### 5. DB query — clockIn() — Insert gps_status

Update the INSERT SQL and `TimeEntryRow` mapper to include the new fields.

### 6. Types — Add to TimeEntry and ReviewItem

```ts
// TimeEntry
clock_in_gps_status?: 'captured' | 'permission_denied' | 'timeout' | 'position_unavailable' | 'unsupported' | 'omitted' | null;
clock_in_gps_error?: string | null;

// ReviewItem
clock_in_gps_status?: string | null;
clock_in_gps_error?: string | null;
```

### 7. findCompletedTechnicians() query — Select gps_status

Add to the correlated subquery for clock-in data.

### 8. ReviewClient.tsx — Update GPS unavailable rendering

Replace the misleading message with:

```tsx
// If gps_status is available
function getGpsStatusInfo(status: string | null | undefined, hasCoords: boolean): { title: string; message: string } {
  if (hasCoords && (!status || status === 'captured')) {
    return { title: 'GPS Captured', message: '' }; // show full details
  }
  switch (status) {
    case 'permission_denied':
      return { title: 'GPS Permission Denied', message: 'Location access was denied in the browser.' };
    case 'timeout':
      return { title: 'GPS Timed Out', message: 'The location request did not resolve in time.' };
    case 'position_unavailable':
      return { title: 'GPS Unavailable', message: 'The browser could not determine a position (weak signal or indoors).' };
    case 'unsupported':
      return { title: 'GPS Not Supported', message: 'This browser does not support geolocation.' };
    case 'omitted':
      return { title: 'GPS Not Saved', message: 'No location data was saved for this clock-in.' };
    default:
      return { title: 'GPS Not Saved', message: 'No location data was saved for this clock-in.' };
  }
}
```

**No "device or browser" blame.** No "desktop/laptop unreliable" claim. Just the factual reason or a neutral fallback.
