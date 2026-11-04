"""Read-only inspection of the live Loot Council database.

Opens the file in SQLite read-only mode (mode=ro) so it cannot be modified.
Reports table inventory, row counts, migration bookkeeping, and profile
backfill status so we can decide how to reconcile the migration history.
"""

import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "data/loot-council.db"
con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
cur = con.cursor()

tables = [
    r[0]
    for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
]
print(f"=== {len(tables)} TABLES ===")
for t in tables:
    count = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    print(f"  {t:<24} {count:>8} rows")

print("\n=== _prisma_migrations ===")
if "_prisma_migrations" in tables:
    for row in cur.execute(
        "SELECT migration_name, applied_steps_count, finished_at, rolled_back_at "
        "FROM _prisma_migrations ORDER BY started_at"
    ):
        print(f"  {row}")
else:
    print("  ABSENT -> database was created with `prisma db push`, not `migrate`")

print("\n=== profileId backfill status ===")
for t in ("Account", "CategoryGroup", "Payee", "Settings", "Asset"):
    if t not in tables:
        print(f"  {t}: table missing")
        continue
    cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{t}")')]
    if "profileId" not in cols:
        print(f"  {t}: NO profileId column (schema drift)")
        continue
    total = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    nulls = cur.execute(f'SELECT COUNT(*) FROM "{t}" WHERE profileId IS NULL').fetchone()[0]
    print(f"  {t}: {total} rows, {nulls} with NULL profileId")

print("\n=== UserStats (the only genuinely destructive drop) ===")
if "UserStats" in tables:
    count = cur.execute("SELECT COUNT(*) FROM UserStats").fetchone()[0]
    print(f"  present, {count} rows")
    for row in cur.execute("SELECT * FROM UserStats LIMIT 5"):
        print(f"    {row}")
else:
    print("  ABSENT -> nothing to lose, drop is a no-op")

con.close()
