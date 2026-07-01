import argparse
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import create_database_engine, create_session_factory
from app.models import Organization, Registry
from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Phase 6F maintenance helpers.")
    parser.add_argument("--database-url", default=None)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "preflight",
        help="Check root/default-registry cardinality before Phase 6F live verification.",
    )
    subparsers.add_parser(
        "ensure-default-registry",
        help="Idempotently ensure the single root organization has one active default registry.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    engine = create_database_engine(args.database_url)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        if args.command == "preflight":
            root_count, default_count, matching_default_count = _preflight_counts(session)
            print(
                "Phase 6F preflight: "
                f"active_root_organizations={root_count}, "
                f"active_default_registries={default_count}, "
                f"root_owned_default_registries={matching_default_count}"
            )
            return 0 if (root_count, default_count, matching_default_count) == (1, 1, 1) else 1

        if args.command == "ensure-default-registry":
            try:
                registry = RegistrySchemaService(session).ensure_single_root_default_registry()
            except RegistrySchemaError as exc:
                session.rollback()
                print(f"Phase 6F default registry repair failed: {exc}")
                return 1
            session.commit()
            print(
                "Phase 6F default registry ready: "
                f"id={registry.id}, owner_organization_id={registry.owner_organization_id}"
            )
            return 0

    parser.error("Unknown Phase 6F command.")
    return 2


def _preflight_counts(session: Session) -> tuple[int, int, int]:
    root_count = session.scalar(
        select(func.count())
        .select_from(Organization)
        .where(
            Organization.parent_id.is_(None),
            Organization.archived_at.is_(None),
            Organization.is_active.is_(True),
        )
    )
    default_count = session.scalar(
        select(func.count())
        .select_from(Registry)
        .where(
            Registry.is_default_for_owner_tree.is_(True),
            Registry.archived_at.is_(None),
            Registry.lifecycle_status != "archived",
        )
    )
    matching_default_count = session.scalar(
        select(func.count())
        .select_from(Registry)
        .join(Organization, Organization.id == Registry.owner_organization_id)
        .where(
            Organization.parent_id.is_(None),
            Organization.archived_at.is_(None),
            Organization.is_active.is_(True),
            Registry.is_default_for_owner_tree.is_(True),
            Registry.archived_at.is_(None),
            Registry.lifecycle_status != "archived",
        )
    )
    return int(root_count or 0), int(default_count or 0), int(matching_default_count or 0)


if __name__ == "__main__":
    raise SystemExit(main())
