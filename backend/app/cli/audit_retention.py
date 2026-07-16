import argparse
from collections.abc import Sequence

from app.core.database import create_database_engine, create_session_factory
from app.services.audit import AuditRetentionService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Delete audit events past their retention period.")
    parser.add_argument("--database-url", default=None)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    engine = create_database_engine(args.database_url)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        deleted_events = AuditRetentionService(session).delete_expired_events()
        session.commit()

    print(f"Audit retention completed: deleted_events={deleted_events}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
