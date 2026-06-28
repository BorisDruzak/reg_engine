from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADR_PATH = REPO_ROOT / "docs" / "ADR" / "0006-generated-document-templates.md"
ARCHITECTURE_PATH = REPO_ROOT / "docs" / "PHASE_2C_GENERATED_DOCUMENT_TEMPLATES.md"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_phase_2c_adr_records_generated_document_decisions() -> None:
    text = _read(ADR_PATH)

    required_fragments = [
        "## Status\n\nAccepted",
        "docx_text_v1",
        "schema-driven card data",
        "no hardcoded HR",
        "stored_files",
        "generated_documents",
        "registry.schema.manage",
        "cards.manage",
        "Public links do not generate, upload, or download documents",
        "`file_ref` remains deferred",
        "PDF remains deferred",
    ]
    for fragment in required_fragments:
        assert fragment in text


def test_phase_2c_architecture_defines_schema_service_and_tests() -> None:
    text = _read(ARCHITECTURE_PATH)

    required_fragments = [
        "document_templates",
        "generated_documents",
        "template_format",
        "docx_text_v1",
        "output_filename_template",
        "DocumentService",
        "{{ card.display_name }}",
        "{{ fields.<block_code>.<field_code> }}",
        "storage prefix `generated_documents`",
        "archive, not physical delete",
        "test_generated_document_renders_schema_driven_card_data_to_storage",
        "test_generated_document_archive_preserves_stored_file_and_writes_audit",
    ]
    for fragment in required_fragments:
        assert fragment in text
