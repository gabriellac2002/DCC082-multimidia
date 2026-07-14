from __future__ import annotations

import sqlite3

def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    _init_schema(conn)
    return conn

def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS songs (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            title  TEXT,
            artist TEXT,
            path   TEXT
        );

        CREATE TABLE IF NOT EXISTS fingerprints (
            hash        INTEGER,
            song_id     INTEGER,
            time_offset REAL
        );

        CREATE INDEX IF NOT EXISTS idx_fingerprints_hash
            ON fingerprints (hash);
        """
    )
    conn.commit()

def insert_song(
    conn: sqlite3.Connection, title: str, artist: str, path: str
) -> int:
    cursor = conn.execute(
        "INSERT INTO songs (title, artist, path) VALUES (?, ?, ?)",
        (title, artist, path),
    )
    conn.commit()
    return int(cursor.lastrowid)

def insert_fingerprints(
    conn: sqlite3.Connection,
    song_id: int,
    fingerprints: list[tuple[int, float]],
) -> int:
    rows = [(h, song_id, offset) for (h, offset) in fingerprints]
    conn.executemany(
        "INSERT INTO fingerprints (hash, song_id, time_offset) "
        "VALUES (?, ?, ?)",
        rows,
    )
    conn.commit()
    return len(rows)

def query(
    conn: sqlite3.Connection, hashes: list[int]
) -> dict[int, list[tuple[float, int]]]:
    hash_to_query_indices: dict[int, list[int]] = {}
    for idx, h in enumerate(hashes):
        hash_to_query_indices.setdefault(h, []).append(idx)

    unique_hashes = list(hash_to_query_indices.keys())
    results: dict[int, list[tuple[float, int]]] = {}

    CHUNK = 900
    for start in range(0, len(unique_hashes), CHUNK):
        chunk = unique_hashes[start:start + CHUNK]
        placeholders = ",".join("?" * len(chunk))
        sql = (
            f"SELECT hash, song_id, time_offset "
            f"FROM fingerprints WHERE hash IN ({placeholders})"
        )
        for h, song_id, time_offset in conn.execute(sql, chunk):
            for q_idx in hash_to_query_indices[h]:
                results.setdefault(song_id, []).append((time_offset, q_idx))

    return results
