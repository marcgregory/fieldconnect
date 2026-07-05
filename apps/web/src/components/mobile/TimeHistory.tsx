'use client';

import { useState, useEffect } from 'react';
import { Card, Spinner } from '@fieldconnect/ui';
import { getTimeEntries } from '@/lib/api';
import type { TimeEntryWithProject } from '@fieldconnect/shared';

export function TimeHistory() {
  const [entries, setEntries] = useState<TimeEntryWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetch() {
      try {
        setLoading(true);
        // Get this week's entries
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);

        const data = await getTimeEntries({
          from: startOfWeek.toISOString(),
        });
        setEntries(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entries');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  function formatDuration(entry: TimeEntryWithProject): string {
    if (!entry.clock_out) return 'In progress';
    const start = new Date(entry.clock_in).getTime();
    const end = new Date(entry.clock_out).getTime();
    const totalMinutes = (end - start) / 60000 - entry.break_minutes;
    if (totalMinutes < 0) return '0m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  if (loading) {
    return (
      <Card title="Time History">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Time History">
        <p className="text-red-600 text-sm">{error}</p>
      </Card>
    );
  }

  return (
    <Card title="This Week's Activity">
      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">
          No time entries this week
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {entry.project_name}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(entry.clock_in).toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  {new Date(entry.clock_in).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {entry.clock_out && (
                    <>
                      {' — '}
                      {new Date(entry.clock_out).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </>
                  )}
                </p>
                {entry.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.notes}</p>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900 ml-3 whitespace-nowrap">
                {formatDuration(entry)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
