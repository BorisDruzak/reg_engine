import hashlib
import re
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import desc, event, select
from sqlalchemy.orm import Session

from app.models import Card, CardAttachment, CardPublicLink, StoredFile
from app.services.audit import AuditService
from app.services.permissions import (
    PermissionDeniedError,
    PermissionService,
    PersistStatePermissionDeniedError,
    PublicLinkSubmittedReadOnlyError,
)


class AttachmentServiceError(ValueError):
    """Raised when an attachment operation references invalid attachment state."""


class AttachmentStorageError(ValueError):
    """Raised when storage receives an unsafe key or cannot access content."""


@dataclass(frozen=True)
class StoredObjectInfo:
    storage_key: str
    content_length_bytes: int
    checksum_sha256: str


@dataclass(frozen=True)
class MalwareScanResult:
    scanner_status: str
    scanner_checked_at: datetime | None = None
    scanner_details_json: dict[str, str] | None = None


class AttachmentStorage(Protocol):
    backend_name: str

    def write_bytes(self, content: bytes) -> StoredObjectInfo:
        """Store bytes and return metadata needed for database rows."""
        ...

    def read_bytes(self, storage_key: str) -> bytes:
        """Read bytes for an already-authorized storage key."""
        ...

    def exists(self, storage_key: str) -> bool:
        """Return whether the backend has an object for the key."""
        ...

    def delete_bytes(self, storage_key: str) -> None:
        """Delete a stored object after failed metadata persistence."""
        ...


@dataclass(frozen=True)
class PendingStoredObjectCleanup:
    storage: AttachmentStorage
    storage_key: str


_PENDING_ATTACHMENT_STORAGE_CLEANUPS = "reg_engine_pending_attachment_storage_cleanups"


def _pending_storage_cleanups(session: Session) -> list[PendingStoredObjectCleanup]:
    pending = session.info.setdefault(_PENDING_ATTACHMENT_STORAGE_CLEANUPS, [])
    return cast(list[PendingStoredObjectCleanup], pending)


def _remember_pending_storage_cleanup(
    session: Session,
    *,
    storage: AttachmentStorage,
    storage_key: str,
) -> PendingStoredObjectCleanup:
    pending_cleanup = PendingStoredObjectCleanup(storage=storage, storage_key=storage_key)
    _pending_storage_cleanups(session).append(pending_cleanup)
    return pending_cleanup


def _forget_pending_storage_cleanup(
    session: Session,
    pending_cleanup: PendingStoredObjectCleanup,
) -> None:
    pending = session.info.get(_PENDING_ATTACHMENT_STORAGE_CLEANUPS)
    if not isinstance(pending, list):
        return
    with suppress(ValueError):
        pending.remove(pending_cleanup)
    if not pending:
        session.info.pop(_PENDING_ATTACHMENT_STORAGE_CLEANUPS, None)


@event.listens_for(Session, "after_commit")
def _clear_pending_storage_cleanups_after_commit(session: Session) -> None:
    session.info.pop(_PENDING_ATTACHMENT_STORAGE_CLEANUPS, None)


@event.listens_for(Session, "after_rollback")
def _run_pending_storage_cleanups_after_rollback(session: Session) -> None:
    pending = session.info.pop(_PENDING_ATTACHMENT_STORAGE_CLEANUPS, [])
    if not isinstance(pending, list):
        return
    for pending_cleanup in pending:
        if not isinstance(pending_cleanup, PendingStoredObjectCleanup):
            continue
        with suppress(Exception):
            pending_cleanup.storage.delete_bytes(pending_cleanup.storage_key)


class MalwareScanner(Protocol):
    def scan(self, *, storage: AttachmentStorage, storage_key: str) -> MalwareScanResult:
        """Scan a stored object and return a persisted scanner status."""
        ...


class DeferredMalwareScanner:
    def scan(self, *, storage: AttachmentStorage, storage_key: str) -> MalwareScanResult:
        return MalwareScanResult(scanner_status="deferred")


class LocalFilesystemAttachmentStorage:
    backend_name = "local_filesystem"

    def __init__(self, root: Path | str, *, key_prefix: str = "attachments") -> None:
        self.root = Path(root).resolve()
        self.key_prefix = self._clean_key_prefix(key_prefix)
        self.root.mkdir(parents=True, exist_ok=True)

    def write_bytes(self, content: bytes) -> StoredObjectInfo:
        now = datetime.now(UTC)
        storage_key = f"{self.key_prefix}/{now:%Y/%m}/{uuid4()}"
        path = self._path_for_key(storage_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return StoredObjectInfo(
            storage_key=storage_key,
            content_length_bytes=len(content),
            checksum_sha256=hashlib.sha256(content).hexdigest(),
        )

    def read_bytes(self, storage_key: str) -> bytes:
        return self._path_for_key(storage_key).read_bytes()

    def exists(self, storage_key: str) -> bool:
        return self._path_for_key(storage_key).is_file()

    def delete_bytes(self, storage_key: str) -> None:
        try:
            self._path_for_key(storage_key).unlink()
        except FileNotFoundError:
            return

    def _path_for_key(self, storage_key: str) -> Path:
        if "\\" in storage_key:
            raise AttachmentStorageError("Storage keys must use forward slashes.")
        parsed = PurePosixPath(storage_key)
        if parsed.is_absolute() or any(part in {"", ".", ".."} for part in parsed.parts):
            raise AttachmentStorageError("Unsafe attachment storage key.")

        path = (self.root / Path(*parsed.parts)).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise AttachmentStorageError(
                "Attachment storage key escapes the storage root."
            ) from exc
        return path

    def _clean_key_prefix(self, key_prefix: str) -> str:
        cleaned = key_prefix.strip().strip("/")
        if not cleaned:
            raise AttachmentStorageError("Attachment storage key prefix must not be empty.")
        parsed = PurePosixPath(cleaned)
        if parsed.is_absolute() or any(part in {"", ".", ".."} for part in parsed.parts):
            raise AttachmentStorageError("Unsafe attachment storage key prefix.")
        return str(parsed)


class AttachmentService:
    def __init__(
        self,
        session: Session,
        *,
        storage: AttachmentStorage,
        scanner: MalwareScanner | None = None,
        max_attachment_bytes: int = 10 * 1024 * 1024,
        allowed_content_types: set[str] | None = None,
    ) -> None:
        self.session = session
        self.storage = storage
        self.scanner = scanner or DeferredMalwareScanner()
        self.max_attachment_bytes = max_attachment_bytes
        self.allowed_content_types = {
            content_type.strip().lower()
            for content_type in (allowed_content_types or set())
            if content_type.strip()
        }

    def create_attachment_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        original_filename: str,
        content_type: str,
        content: bytes,
        title: str | None = None,
        description: str | None = None,
    ) -> CardAttachment:
        card = self._get_editable_card(card_id)
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        clean_original_filename = normalize_attachment_filename(original_filename)
        clean_content_type = self._clean_required_text(content_type, "content type")
        return self._create_attachment(
            card=card,
            created_by_user_id=actor_user_id,
            original_filename=clean_original_filename,
            content_type=clean_content_type,
            content=content,
            title=title,
            description=description,
            audit_actor_user_id=actor_user_id,
            audit_public_link_id=None,
        )

    def _create_attachment(
        self,
        *,
        card: Card,
        created_by_user_id: UUID,
        original_filename: str,
        content_type: str,
        content: bytes,
        title: str | None,
        description: str | None,
        audit_actor_user_id: UUID | None,
        audit_public_link_id: UUID | None,
    ) -> CardAttachment:
        self._validate_attachment_content(content)
        self._validate_content_type(content_type)

        stored_info = self.storage.write_bytes(content)
        pending_cleanup = _remember_pending_storage_cleanup(
            self.session,
            storage=self.storage,
            storage_key=stored_info.storage_key,
        )
        try:
            scan_result = self.scanner.scan(
                storage=self.storage,
                storage_key=stored_info.storage_key,
            )
            stored_file = StoredFile(
                storage_backend=self.storage.backend_name,
                storage_key=stored_info.storage_key,
                original_filename=original_filename,
                content_type=content_type,
                content_length_bytes=stored_info.content_length_bytes,
                checksum_sha256=stored_info.checksum_sha256,
                scanner_status=scan_result.scanner_status,
                scanner_checked_at=scan_result.scanner_checked_at,
                scanner_details_json=scan_result.scanner_details_json,
                created_by=created_by_user_id,
            )
            self.session.add(stored_file)
            self.session.flush()

            attachment = CardAttachment(
                card_id=card.id,
                stored_file_id=stored_file.id,
                title=self._attachment_title(title, original_filename),
                description=description,
                position=self._next_position(card.id),
                created_by=created_by_user_id,
            )
            self.session.add(attachment)
            self.session.flush()
            self._record_attachment_audit(
                actor_user_id=audit_actor_user_id,
                actor_public_link_id=audit_public_link_id,
                action="attachment_create",
                object_id=attachment.id,
                new_data_json={
                    "card_id": str(card.id),
                    "stored_file_id": str(stored_file.id),
                    "content_length_bytes": stored_file.content_length_bytes,
                    "checksum_sha256": stored_file.checksum_sha256,
                    "scanner_status": stored_file.scanner_status,
                },
            )
            return attachment
        except Exception:
            with suppress(Exception):
                self.storage.delete_bytes(stored_info.storage_key)
            _forget_pending_storage_cleanup(self.session, pending_cleanup)
            raise

    def list_attachments_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        include_archive: bool = False,
    ) -> list[CardAttachment]:
        card = self._get_readable_card(card_id, include_archive=include_archive)
        self._require_card_read(actor_user_id, card)

        criteria = [CardAttachment.card_id == card.id]
        if not include_archive:
            criteria.append(CardAttachment.archived_at.is_(None))

        return list(
            self.session.scalars(
                select(CardAttachment)
                .where(*criteria)
                .order_by(CardAttachment.position, CardAttachment.id)
            ).all()
        )

    def read_attachment_for_actor(
        self,
        *,
        actor_user_id: UUID,
        attachment_id: UUID,
        include_archive: bool = False,
    ) -> CardAttachment:
        attachment = self._get_attachment(attachment_id)
        if attachment.archived_at is not None and not include_archive:
            raise AttachmentServiceError("Attachment is only readable in archive scope.")
        card = self._get_readable_card(attachment.card_id, include_archive=include_archive)
        self._require_card_read(actor_user_id, card)
        return attachment

    def read_attachment_content_for_actor(
        self,
        *,
        actor_user_id: UUID,
        attachment_id: UUID,
        include_archive: bool = False,
    ) -> bytes:
        attachment = self.read_attachment_for_actor(
            actor_user_id=actor_user_id,
            attachment_id=attachment_id,
            include_archive=include_archive,
        )
        stored_file = self._get_stored_file(attachment.stored_file_id)
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="attachment_download",
            object_type="card_attachment",
            object_id=attachment.id,
            new_data_json={
                "stored_file_id": str(stored_file.id),
                "content_length_bytes": stored_file.content_length_bytes,
            },
        )
        return self.storage.read_bytes(stored_file.storage_key)

    def archive_attachment_for_actor(
        self,
        *,
        actor_user_id: UUID,
        attachment_id: UUID,
        archive_reason: str | None = None,
    ) -> CardAttachment:
        attachment = self._get_attachment(attachment_id)
        if attachment.archived_at is not None:
            return attachment

        card = self._get_editable_card(attachment.card_id)
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        attachment.archived_at = datetime.now(UTC)
        attachment.archived_by = actor_user_id
        attachment.archive_reason = archive_reason
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="attachment_archive",
            object_type="card_attachment",
            object_id=attachment.id,
            old_data_json={"archived_at": None},
            new_data_json={
                "card_id": str(card.id),
                "stored_file_id": str(attachment.stored_file_id),
                "archive_reason": archive_reason,
            },
        )
        return attachment

    def create_attachment_from_public_link(
        self,
        *,
        actor_public_link_id: UUID,
        card_id: UUID,
        original_filename: str,
        content_type: str,
        content: bytes,
        title: str | None = None,
        description: str | None = None,
    ) -> CardAttachment:
        public_link = self._get_public_attachment_link(
            actor_public_link_id,
            lock_for_update=True,
        )
        self._require_public_attachment_upload_available(public_link)
        card = self._get_public_attachment_card(public_link, card_id=card_id)
        created_by_user_id = self._public_link_created_by(public_link)
        clean_original_filename = normalize_attachment_filename(original_filename)
        clean_content_type = self._clean_required_text(content_type, "content type")
        attachment = self._create_attachment(
            card=card,
            created_by_user_id=created_by_user_id,
            original_filename=clean_original_filename,
            content_type=clean_content_type,
            content=content,
            title=title,
            description=description,
            audit_actor_user_id=None,
            audit_public_link_id=public_link.id,
        )
        public_link.attachment_upload_count += 1
        self.session.flush()
        return attachment

    def list_attachments_from_public_link(
        self,
        *,
        actor_public_link_id: UUID,
        card_id: UUID,
    ) -> list[CardAttachment]:
        public_link = self._get_public_attachment_link(actor_public_link_id)
        card = self._get_public_attachment_card(public_link, card_id=card_id)
        return list(
            self.session.scalars(
                select(CardAttachment)
                .where(
                    CardAttachment.card_id == card.id,
                    CardAttachment.archived_at.is_(None),
                )
                .order_by(CardAttachment.position, CardAttachment.id)
            ).all()
        )

    def read_attachment_from_public_link(
        self,
        *,
        actor_public_link_id: UUID,
        attachment_id: UUID,
    ) -> CardAttachment:
        public_link = self._get_public_attachment_link(actor_public_link_id)
        attachment = self._get_attachment(attachment_id)
        if attachment.archived_at is not None:
            raise AttachmentServiceError("Attachment was not found.")
        self._get_public_attachment_card(public_link, card_id=attachment.card_id)
        return attachment

    def read_attachment_content_from_public_link(
        self,
        *,
        actor_public_link_id: UUID,
        attachment_id: UUID,
    ) -> bytes:
        attachment = self.read_attachment_from_public_link(
            actor_public_link_id=actor_public_link_id,
            attachment_id=attachment_id,
        )
        stored_file = self._get_stored_file(attachment.stored_file_id)
        AuditService(self.session).record_public_link_event(
            actor_public_link_id=actor_public_link_id,
            action="attachment_download",
            object_type="card_attachment",
            object_id=attachment.id,
            new_data_json={
                "stored_file_id": str(stored_file.id),
                "content_length_bytes": stored_file.content_length_bytes,
            },
        )
        return self.storage.read_bytes(stored_file.storage_key)

    def get_stored_file_for_attachment(self, attachment: CardAttachment) -> StoredFile:
        return self._get_stored_file(attachment.stored_file_id)

    def _validate_attachment_content(self, content: bytes) -> None:
        if not content:
            raise AttachmentServiceError("Attachment content must not be empty.")
        if len(content) > self.max_attachment_bytes:
            raise AttachmentServiceError("Attachment content exceeds the configured size limit.")

    def _validate_content_type(self, content_type: str) -> None:
        if not self.allowed_content_types:
            return
        if content_type.lower() not in self.allowed_content_types:
            raise AttachmentServiceError("Attachment content type is not allowed.")

    def _get_attachment(self, attachment_id: UUID) -> CardAttachment:
        attachment = self.session.get(CardAttachment, attachment_id)
        if attachment is None:
            raise AttachmentServiceError("Attachment was not found.")
        return attachment

    def _get_stored_file(self, stored_file_id: UUID) -> StoredFile:
        stored_file = self.session.get(StoredFile, stored_file_id)
        if stored_file is None:
            raise AttachmentServiceError("Stored file was not found.")
        return stored_file

    def _get_public_attachment_link(
        self,
        public_link_id: UUID,
        *,
        lock_for_update: bool = False,
    ) -> CardPublicLink:
        if lock_for_update:
            statement = (
                select(CardPublicLink)
                .where(CardPublicLink.id == public_link_id)
                .execution_options(populate_existing=True)
                .with_for_update()
            )
            public_link = self.session.scalars(statement).one_or_none()
        else:
            public_link = self.session.get(CardPublicLink, public_link_id)
        if public_link is None:
            raise PermissionDeniedError("Public link is not active.")

        now = datetime.now(UTC)
        editable_statuses = {"active", "changes_requested"}
        if public_link.status == "submitted":
            raise PublicLinkSubmittedReadOnlyError("Public link was already submitted.")
        if public_link.status not in editable_statuses or public_link.expires_at <= now:
            if public_link.expires_at <= now and public_link.status in editable_statuses:
                old_status = public_link.status
                public_link.status = "expired"
                public_link.can_view = False
                public_link.can_edit = False
                AuditService(self.session).record_system_event(
                    action="public_link.expire",
                    object_type="card_public_link",
                    object_id=public_link.id,
                    old_data_json={"status": old_status},
                    new_data_json={"status": "expired"},
                )
                raise PersistStatePermissionDeniedError("Public link has expired.")
            raise PermissionDeniedError("Public link is not active.")
        if not public_link.can_edit:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        return public_link

    def _require_public_attachment_upload_available(
        self,
        public_link: CardPublicLink,
    ) -> None:
        if (
            public_link.max_attachment_uploads is not None
            and public_link.attachment_upload_count >= public_link.max_attachment_uploads
        ):
            raise PermissionDeniedError("Public link attachment upload limit is exhausted.")

    def _get_public_attachment_card(
        self,
        public_link: CardPublicLink,
        *,
        card_id: UUID,
    ) -> Card:
        if card_id != public_link.card_id:
            raise PermissionDeniedError("Public link cannot access attachments for this card.")
        card = self._get_editable_card(card_id)
        if not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        return card

    def _public_link_created_by(self, public_link: CardPublicLink) -> UUID:
        if public_link.created_by is None:
            raise PermissionDeniedError("Public link creator is required for file uploads.")
        return public_link.created_by

    def _get_editable_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise AttachmentServiceError("Card was not found.")
        return card

    def _get_readable_card(self, card_id: UUID, *, include_archive: bool) -> Card:
        card = self.session.get(Card, card_id)
        if card is None:
            raise AttachmentServiceError("Card was not found.")
        if card.lifecycle_status in {"archived", "superseded"} and not include_archive:
            raise AttachmentServiceError("Card is only readable in archive scope.")
        if card.archived_at is not None and not include_archive:
            raise AttachmentServiceError("Card is only readable in archive scope.")
        return card

    def _require_card_permission(
        self,
        actor_user_id: UUID,
        organization_id: UUID,
        *,
        registry_id: UUID,
    ) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage attachments in this card scope.")

    def _require_card_read(self, actor_user_id: UUID, card: Card) -> None:
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read attachments in this card scope.")

    def _next_position(self, card_id: UUID) -> int:
        latest_position = self.session.scalar(
            select(CardAttachment.position)
            .where(CardAttachment.card_id == card_id)
            .order_by(desc(CardAttachment.position))
            .limit(1)
        )
        return 0 if latest_position is None else latest_position + 1

    def _attachment_title(self, title: str | None, original_filename: str) -> str:
        if title is not None and title.strip():
            return title.strip()
        return self._clean_required_text(original_filename, "original filename")

    def _clean_required_text(self, value: str, label: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise AttachmentServiceError(f"Attachment {label} must not be empty.")
        return cleaned

    def _record_attachment_audit(
        self,
        *,
        actor_user_id: UUID | None,
        actor_public_link_id: UUID | None,
        action: str,
        object_id: UUID,
        new_data_json: dict[str, object],
    ) -> None:
        audit_service = AuditService(self.session)
        if actor_public_link_id is not None:
            audit_service.record_public_link_event(
                actor_public_link_id=actor_public_link_id,
                action=action,
                object_type="card_attachment",
                object_id=object_id,
                new_data_json=new_data_json,
            )
            return
        if actor_user_id is None:
            raise AttachmentServiceError("Attachment audit actor is required.")
        audit_service.record_user_event(
            actor_user_id=actor_user_id,
            action=action,
            object_type="card_attachment",
            object_id=object_id,
            new_data_json=new_data_json,
        )


_UNSAFE_FILENAME_PATTERN = re.compile("[\\x00-\\x1f\\x7f\\\\/\"';]+")


def normalize_attachment_filename(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise AttachmentServiceError("Attachment original filename must not be empty.")
    normalized = _UNSAFE_FILENAME_PATTERN.sub("_", cleaned)
    if not normalized.strip("._ "):
        raise AttachmentServiceError("Attachment original filename must not be empty.")
    return normalized
