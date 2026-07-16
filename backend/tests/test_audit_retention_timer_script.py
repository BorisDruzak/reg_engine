from pathlib import Path


def test_audit_retention_timer_script_installs_a_persistent_daily_oneshot_timer() -> None:
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "audit-retention.ps1"
    script = script_path.read_text(encoding="utf-8")

    assert "-m app.cli.audit_retention" in script
    assert "Type=oneshot" in script
    assert "OnCalendar=daily" in script
    assert "Persistent=true" in script
    assert "WantedBy=timers.target" in script
    assert "systemctl enable --now '$timerUnitName'" in script
    assert "systemctl status '$serviceUnitName' --no-pager || true" in script
    assert "systemctl show '$serviceUnitName' -p Result --value" in script
