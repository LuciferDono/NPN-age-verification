"""SQLite persistence: audit log + manual review queue.

Hard rule enforced here, not merely claimed in slides: **image bytes are never
persisted.** Only a SHA-256 digest reaches this module — see `hash_image`. The
functions below take a digest string; there is no code path that accepts bytes.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).with_name("npn.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id   TEXT NOT NULL,
    event        TEXT NOT NULL,
    actor        TEXT NOT NULL DEFAULT 'system',
    detail       TEXT NOT NULL DEFAULT '',
    image_sha256 TEXT,
    created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_queue (
    request_id            TEXT PRIMARY KEY,
    age_estimate          REAL,
    confidence            REAL,
    confidence_percentile REAL,
    band_json             TEXT,
    reason                TEXT NOT NULL,
    created_at            TEXT NOT NULL,
    resolved              INTEGER NOT NULL DEFAULT 0,
    reviewer              TEXT,
    verdict               TEXT,
    override_age          REAL,
    resolved_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_open ON review_queue(resolved, created_at DESC);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


@contextmanager
def _conn():
    """Commit-and-close. `sqlite3.Connection.__exit__` commits but does NOT close,
    which leaks a handle per call — on Windows that also locks the DB file."""
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with _conn() as c:
        c.executescript(SCHEMA)


def hash_image(data: bytes) -> str:
    """The only place raw bytes are touched. Returns a digest; bytes are discarded."""
    return hashlib.sha256(data).hexdigest()


def log(request_id: str, event: str, detail: str = "", actor: str = "system",
        image_sha256: str | None = None) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO audit(request_id,event,actor,detail,image_sha256,created_at)"
            " VALUES(?,?,?,?,?,?)",
            (request_id, event, actor, detail, image_sha256, _now()),
        )


def audit(limit: int = 50) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def enqueue(request_id: str, age_estimate: float | None, confidence: float | None,
            confidence_percentile: float | None, band: dict | None, reason: str) -> None:
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO review_queue(request_id,age_estimate,confidence,"
            "confidence_percentile,band_json,reason,created_at,resolved)"
            " VALUES(?,?,?,?,?,?,?,0)",
            (request_id, age_estimate, confidence, confidence_percentile,
             json.dumps(band) if band else None, reason, _now()),
        )


def queue(include_resolved: bool = False) -> list[dict]:
    sql = "SELECT * FROM review_queue"
    if not include_resolved:
        sql += " WHERE resolved=0"
    sql += " ORDER BY created_at DESC"
    with _conn() as c:
        rows = c.execute(sql).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["band"] = json.loads(d.pop("band_json")) if d.get("band_json") else None
        d["resolved"] = bool(d["resolved"])
        out.append(d)
    return out


def resolve(request_id: str, reviewer: str, verdict: str,
            override_age: float | None = None) -> dict | None:
    if verdict not in ("accept", "override"):
        raise ValueError("verdict must be 'accept' or 'override'")
    if verdict == "override" and override_age is None:
        raise ValueError("override requires override_age")
    with _conn() as c:
        cur = c.execute(
            "UPDATE review_queue SET resolved=1,reviewer=?,verdict=?,override_age=?,"
            "resolved_at=? WHERE request_id=? AND resolved=0",
            (reviewer, verdict, override_age, _now(), request_id),
        )
        if cur.rowcount == 0:
            return None
    log(request_id, "review_resolved",
        f"verdict={verdict} override_age={override_age}", actor=reviewer)
    items = [q for q in queue(include_resolved=True) if q["request_id"] == request_id]
    return items[0] if items else None


def _selfcheck() -> None:
    """Run: python server/store.py  (uses a scratch DB, then deletes it)"""
    global DB_PATH
    DB_PATH = Path(__file__).with_name("_selfcheck.db")
    DB_PATH.unlink(missing_ok=True)
    init()

    digest = hash_image(b"fake image bytes")
    assert len(digest) == 64 and digest == hash_image(b"fake image bytes"), "stable digest"

    log("req-1", "predict", "age=34.2", image_sha256=digest)
    assert audit()[0]["request_id"] == "req-1"
    assert audit()[0]["image_sha256"] == digest

    enqueue("req-1", 17.4, 0.31, 0.08, {"id": "young_adult"}, "low_confidence")
    q = queue()
    assert len(q) == 1 and q[0]["band"]["id"] == "young_adult"

    assert resolve("req-1", "dr_a", "override", 19.0)["verdict"] == "override"
    assert queue() == [], "resolved items leave the open queue"
    assert resolve("req-1", "dr_a", "accept") is None, "double-resolve is a no-op"

    events = [r["event"] for r in audit()]
    assert "review_resolved" in events, "resolution is audited"

    try:
        resolve("req-x", "dr_a", "override")
    except ValueError:
        pass
    else:
        raise AssertionError("override without age must raise")

    DB_PATH.unlink(missing_ok=True)
    print("store.py selfcheck OK")


if __name__ == "__main__":
    _selfcheck()
