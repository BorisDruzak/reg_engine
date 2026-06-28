from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADR_PATH = REPO_ROOT / "docs" / "ADR" / "0005-attachment-storage-architecture.md"
ARCHITECTURE_PATH = REPO_ROOT / "docs" / "PHASE_2A_ATTACHMENT_ARCHITECTURE.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_2a_storage_adr_records_approved_decisions() -> None:
    text = _read(ADR_PATH)

    required_fragments = [
        "## Status\n\nAccepted",
        "card-level attachments first",
        "generated documents are deferred",
        "local filesystem backend",
        "configured outside Git",
        "public links do not upload or download attachments",
        "Phase 2H follow-up",
        "public-link attachment list/upload/download",
        "`actor_type=public_link`",
        "`file_ref` is deferred",
        "scanner hook",
        "hide archived attachments from normal active lists",
        "No upload endpoints or frontend UI are introduced by Phase 2A",
    ]
    for fragment in required_fragments:
        assert fragment in text


def test_phase_2a_architecture_defines_metadata_access_and_tests() -> None:
    text = _read(ARCHITECTURE_PATH)

    required_fragments = [
        "## Metadata Schema Design",
        "stored_files",
        "card_attachments",
        "storage_key",
        "checksum_sha256",
        "scanner_status",
        "## Service Boundary",
        "AttachmentStorage",
        "AttachmentService",
        "MalwareScanner",
        "## Access-Control Rules",
        "Users can create attachments only for cards they can edit.",
        "Users can read or download attachments only for cards they can read.",
        "Public links cannot upload attachments in the first Phase 2 slice.",
        "Public links cannot download attachments in the first Phase 2 slice.",
        "Phase 2H public-link attachment rules",
        "public-link attachment responses omit `stored_file_id`, `checksum_sha256`",
        "## Required Phase 2B Tests Before Upload Endpoints",
        "test_create_attachment_metadata_requires_editable_card",
        "test_read_attachment_metadata_requires_readable_card",
        "test_archive_attachment_preserves_file_metadata_and_writes_audit",
        "test_archived_attachment_is_hidden_from_default_active_list",
        "test_archived_attachment_is_readable_in_archive_scope_for_card_reader",
        "test_public_link_cannot_upload_or_download_attachment",
        "test_storage_key_rejects_path_traversal",
        "test_malware_scanner_hook_records_deferred_status",
        "test_attachment_metadata_rejects_empty_file",
        "test_attachment_metadata_rejects_oversized_file",
        "test_attachment_metadata_records_checksum_sha256",
        "test_descendant_admin_can_read_child_card_attachment",
        "test_sibling_admin_cannot_read_card_attachment",
        "test_superseded_card_attachment_is_read_only",
        "## Required Phase 2H Public-Link Attachment Tests",
        "public-link upload, list, and download succeed",
        "wrong-card states",
    ]
    for fragment in required_fragments:
        assert fragment in text
