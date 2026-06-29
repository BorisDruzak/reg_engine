@{
    # Copy this file to scripts/local.reg_engine.psd1 and fill values locally.
    # The local file is ignored by Git.
    ServerHost = "server-host-or-ssh-alias"
    ServerUser = "root"
    ServerRepo = "/path/to/server/checkout"
    ServiceName = "reg-engine"
    ServiceHost = "0.0.0.0"
    ServicePort = "8000"
    ServiceEnvFile = "/etc/reg_engine/reg_engine.env"
    PgHost = "database-host-or-ip"
    PgPort = "5432"
    PgDatabase = "reg_engine"
    PgUser = "database-role"
}
