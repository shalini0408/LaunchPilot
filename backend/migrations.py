"""Idempotent additive SQLite migrations; existing rows and progress are retained."""
from sqlalchemy import inspect, text

def migrate(engine):
    if 'businesses' not in inspect(engine).get_table_names():return
    with engine.begin() as connection:
        columns={row[1] for row in connection.exec_driver_sql('PRAGMA table_info(businesses)')}
        if 'details' not in columns:
            connection.execute(text("ALTER TABLE businesses ADD COLUMN details JSON NOT NULL DEFAULT '{}'"))

        tables=set(inspect(engine).get_table_names())
        if 'account_projects' in tables:
            columns={row[1] for row in connection.exec_driver_sql('PRAGMA table_info(account_projects)')}
            if 'active' not in columns:connection.exec_driver_sql('ALTER TABLE account_projects ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1')
            if 'last_path' not in columns:connection.exec_driver_sql("ALTER TABLE account_projects ADD COLUMN last_path VARCHAR(200) NOT NULL DEFAULT ''")
            business_columns={row[1] for row in connection.exec_driver_sql('PRAGMA table_info(businesses)')}
            order='b.updated_at DESC, p.rowid DESC' if 'updated_at' in business_columns else 'p.rowid DESC'
            accounts=connection.exec_driver_sql('SELECT account_id FROM account_projects WHERE active=1 GROUP BY account_id HAVING COUNT(*)>1').fetchall()
            for (account_id,) in accounts:
                rows=connection.execute(text('SELECT p.founder_id FROM account_projects p LEFT JOIN businesses b ON b.founder_id=p.founder_id WHERE p.account_id=:id AND p.active=1 ORDER BY '+order),{'id':account_id}).fetchall()
                # Keep the most recently edited business active. Retain every older row and its data.
                connection.execute(text('UPDATE account_projects SET active=0 WHERE account_id=:id AND founder_id<>:founder'),{'id':account_id,'founder':rows[0][0]})
            connection.exec_driver_sql('CREATE UNIQUE INDEX IF NOT EXISTS one_active_business_per_account ON account_projects(account_id) WHERE active=1')
