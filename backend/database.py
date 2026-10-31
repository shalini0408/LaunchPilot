"""SQLite connection and request-scoped SQLAlchemy sessions."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).with_name('.env'))
DEFAULT_URL = 'sqlite:///' + str(Path(__file__).with_name('launchpilot.db').resolve())
DATABASE_URL = os.getenv('DATABASE_URL', DEFAULT_URL)
if not DATABASE_URL.startswith('sqlite:'):
    raise ValueError('Milestone 2 requires a SQLite DATABASE_URL')
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False, 'timeout': 15})

@event.listens_for(engine, 'connect')
def configure_sqlite(connection, _):
    cursor = connection.cursor()
    cursor.execute('PRAGMA foreign_keys=ON')
    cursor.close()

class Base(DeclarativeBase):
    pass

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise

def init_db():
    from . import models  # noqa: F401
    from .research import models as research_models  # noqa: F401 -- additive research tables
    from .advisor import models as advisor_models  # noqa: F401
    from . import accounts, documents  # noqa: F401 -- additive account/project/file tables
    from .migrations import migrate
    migrate(engine)
    Base.metadata.create_all(engine)
    migrate(engine)

if __name__ == '__main__':
    from backend.database import init_db as initialize
    initialize()
    print('LaunchPilot database initialized.')
