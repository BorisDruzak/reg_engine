"""Normalize the approved FIO display field technical code.

Revision ID: 0038_normalize_fio_code
Revises: 0037_remove_display_config

Older registries can have a field labelled ``ФИО`` with an automatically
generated technical code. The card display and XLSX contracts require ``fio``.
Only active, unarchived fields without a same-block code conflict are changed.
Downgrade intentionally preserves the normalized code.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0038_normalize_fio_code"
down_revision: str | None = "0037_remove_display_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE public.form_fields AS f
        SET code = 'fio'
        WHERE f.label = 'ФИО'
          AND f.code <> 'fio'
          AND f.is_active
          AND f.archived_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.form_fields AS existing
              WHERE existing.block_id = f.block_id
                AND existing.code = 'fio'
                AND existing.archived_at IS NULL
          )
        """
    )


def downgrade() -> None:
    # The prior generated code is not recoverable and must not replace a
    # deliberately normalized FIO code.
    pass
