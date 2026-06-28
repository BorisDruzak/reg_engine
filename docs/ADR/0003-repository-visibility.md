# ADR 0003: Repository Visibility And Operational Details

## Status

Accepted

## Context

The GitHub repository is currently public. Earlier documentation included concrete runtime hostnames, LAN IP addresses, SSH users, server checkout paths, database endpoints, and deploy-key details.

Those values are not application source code. Keeping them in a public repository increases operational exposure and makes future secret-handling mistakes harder to spot.

## Decision

The repository may remain public only while committed files avoid concrete private operational details.

Public documentation and committed script defaults must use placeholders or local configuration indirection for:

- runtime hostnames and LAN IP addresses;
- SSH users, targets, and private key paths;
- server checkout paths;
- PostgreSQL host, port, role, and other environment-specific endpoints;
- deploy-key paths and public key values;
- operator-only runbooks.

Concrete operational values must live outside Git in environment variables, server runtime environment files, or ignored local config files such as `scripts/local.reg_engine.psd1`.

If future work requires storing concrete operational runbooks or internal infrastructure inventory in Git, make the GitHub repository private before committing that material.

## Consequences

- Public README and project docs stay useful without exposing local infrastructure.
- Deploy scripts need explicit local configuration for remote operations.
- New scripts should follow the same environment-variable or ignored-local-config pattern.
