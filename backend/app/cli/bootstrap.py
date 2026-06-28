import argparse
from collections.abc import Sequence

from app.core.database import create_database_engine, create_session_factory
from app.services.bootstrap import BootstrapService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bootstrap Registry Engine database data.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed_parser = subparsers.add_parser("seed", help="Seed core permissions and roles.")
    seed_parser.add_argument("--database-url", default=None)

    superadmin_parser = subparsers.add_parser(
        "create-superadmin",
        help="Create or update the first superadmin user.",
    )
    superadmin_parser.add_argument("--database-url", default=None)
    superadmin_parser.add_argument("--email", required=True)
    superadmin_parser.add_argument("--display-name", required=True)
    superadmin_parser.add_argument("--password-hash", default=None)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    engine = create_database_engine(args.database_url)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        service = BootstrapService(session)
        if args.command == "seed":
            result = service.seed_defaults()
            session.commit()
            print(
                "Seeded core bootstrap data: "
                f"permissions_created={result.permissions_created}, "
                f"roles_created={result.roles_created}, "
                f"role_permission_links_created={result.role_permission_links_created}"
            )
            return 0

        if args.command == "create-superadmin":
            user = service.create_superadmin(
                email=args.email,
                display_name=args.display_name,
                password_hash=args.password_hash,
            )
            session.commit()
            print(f"Superadmin ready: id={user.id} email={user.email}")
            return 0

    parser.error("Unknown bootstrap command.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
