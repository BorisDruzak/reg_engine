@{
    # Copy this file to scripts/local.reg_engine.psd1 and fill values locally.
    # The local file is ignored by Git.
    ServerHost = "server-host-or-ssh-alias"
    ServerUser = "root"
    ServerRepo = "/path/to/server/checkout"
    PgHost = "database-host-or-ip"
    PgPort = "5432"
    PgDatabase = "reg_engine"
    PgUser = "database-role"
}
