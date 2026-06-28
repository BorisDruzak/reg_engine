from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine_cache: dict[str, Engine] = {}
_session_factory_cache: dict[Engine, sessionmaker[Session]] = {}


def get_database_url() -> str | None:
    return get_settings().database_url


def create_database_engine(database_url: str | None = None) -> Engine:
    resolved_url = database_url or get_database_url()
    if not resolved_url:
        raise RuntimeError("DATABASE_URL is not configured.")
    if resolved_url not in _engine_cache:
        _engine_cache[resolved_url] = create_engine(resolved_url, pool_pre_ping=True)
    return _engine_cache[resolved_url]


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    if engine not in _session_factory_cache:
        _session_factory_cache[engine] = sessionmaker(
            bind=engine,
            autoflush=False,
            expire_on_commit=False,
        )
    return _session_factory_cache[engine]


def dispose_cached_database_resources() -> None:
    for engine in _engine_cache.values():
        engine.dispose()
    _session_factory_cache.clear()
    _engine_cache.clear()


def get_session() -> Generator[Session, None, None]:
    engine = create_database_engine()
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        yield session
