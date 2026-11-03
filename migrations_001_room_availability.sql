-- UniSpace additive migration 001: room availability management.
-- Safe to run on an existing D1 database. Does not delete or rewrite users,
-- schedules, reservations, buildings, or rooms.
CREATE TABLE IF NOT EXISTS room_unavailability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS idx_room_unavailability_room_date
    ON room_unavailability(room_id, date, start_time, end_time);
