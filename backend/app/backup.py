"""Consistent SQLite backup using its online backup API, never a live file copy."""
import argparse
from pathlib import Path
import sqlite3
from sqlalchemy.engine import make_url
from .config import Settings


def backup_database(database_url: str, destination: str | Path) -> Path:
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database or url.database == ":memory:":
        raise ValueError("This backup command supports file-backed SQLite only; use pg_dump for PostgreSQL.")
    source = Path(url.database).resolve()
    target = Path(destination).resolve()
    if not source.is_file():
        raise ValueError("Source database does not exist.")
    if target == source or target.exists():
        raise ValueError("Choose a new backup filename; existing files are never overwritten.")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Reserve a new file before opening it as SQLite so a concurrent command cannot
    # overwrite an existing backup between the existence check and connection.
    with target.open("xb"):
        pass
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(target) as copied:
            original.backup(copied, pages=100)
            if copied.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed; keep the original database.")
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="New backup file path")
    args = parser.parse_args()
    print("Verified SQLite backup:", backup_database(Settings.from_env().database_url, args.output))


if __name__ == "__main__":
    main()
