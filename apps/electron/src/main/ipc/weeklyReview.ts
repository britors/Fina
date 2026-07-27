import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { WeeklyReviewState, WeeklyReviewStreak } from '../../shared/types';

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Mesmo critério de "início da semana" usado no renderer (domingo).
function currentWeekStart(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return start.toISOString().slice(0, 10);
}

function rowToState(row: { week_start: string; items_json: string; completed_at: string | null } | undefined, weekStart: string): WeeklyReviewState {
  if (!row) return { week_start: weekStart, completed_items: [], completed_at: null };
  let items: string[] = [];
  try { items = JSON.parse(row.items_json); } catch { items = []; }
  return { week_start: row.week_start, completed_items: items, completed_at: row.completed_at };
}

export function registerWeeklyReviewHandlers(): void {
  ipcMain.handle('weeklyReview:getState', (_e, weekStart: string): WeeklyReviewState => {
    const row = getDb().prepare('SELECT * FROM weekly_review_log WHERE week_start = ?')
      .get(weekStart) as { week_start: string; items_json: string; completed_at: string | null } | undefined;
    return rowToState(row, weekStart);
  });

  ipcMain.handle('weeklyReview:setState', (_e, payload: { week_start: string; completed_items: string[]; completed_at: string | null }): WeeklyReviewState => {
    getDb().prepare(`
      INSERT INTO weekly_review_log (week_start, items_json, completed_at) VALUES (?,?,?)
      ON CONFLICT(week_start) DO UPDATE SET items_json = excluded.items_json, completed_at = excluded.completed_at
    `).run(payload.week_start, JSON.stringify(payload.completed_items), payload.completed_at);
    return { week_start: payload.week_start, completed_items: payload.completed_items, completed_at: payload.completed_at };
  });

  ipcMain.handle('weeklyReview:getStreak', (): WeeklyReviewStreak => {
    const rows = getDb().prepare('SELECT week_start, completed_at FROM weekly_review_log ORDER BY week_start ASC')
      .all() as { week_start: string; completed_at: string | null }[];
    const byWeek = new Map(rows.map(r => [r.week_start, r.completed_at]));

    let current = 0;
    let cursor = currentWeekStart();
    while (byWeek.get(cursor)) {
      current++;
      cursor = addDaysIso(cursor, -7);
    }

    let best = 0;
    let run = 0;
    let prevWeek: string | null = null;
    for (const r of rows) {
      if (!r.completed_at) { run = 0; prevWeek = r.week_start; continue; }
      run = prevWeek && addDaysIso(prevWeek, 7) === r.week_start ? run + 1 : 1;
      prevWeek = r.week_start;
      best = Math.max(best, run);
    }

    return { current_streak: current, best_streak: Math.max(best, current) };
  });
}
