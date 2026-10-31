import os
os.environ['SESSION_SECRET']='isolated-unit-test-session-secret-9382-local'
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from backend.database import Base, get_db
from backend.main import app

@pytest.fixture(autouse=True)
def isolated_database(tmp_path, request, monkeypatch):
    """Every API test uses a real, isolated SQLite file, never the developer DB."""
    path = tmp_path / 'test.db'
    engine = create_engine('sqlite:///' + str(path), connect_args={'check_same_thread': False})
    @event.listens_for(engine, 'connect')
    def foreign_keys(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    def override():
        with sessions() as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise
    app.dependency_overrides[get_db] = override
    if request.node.path.name != 'test_accounts.py':
        # Existing feature tests run as a real signed-in account; production auth remains enabled.
        from fastapi.testclient import TestClient
        original=TestClient.__init__
        def signed_in(client,*args,**kwargs):
            original(client,*args,**kwargs)
            credentials={'email':'feature-tests@example.com','password':'Feature-test-password-938!'}
            response=client.post('/api/auth/signup',json=credentials)
            if response.status_code==409:
                response=client.post('/api/auth/signin',json=credentials)
            assert response.status_code in (200,201),response.text
        monkeypatch.setattr(TestClient,'__init__',signed_in)
    yield path
    app.dependency_overrides.clear()
    engine.dispose()
