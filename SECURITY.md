# Security policy

## Supported versions

Security fixes are provided for the latest published Cogni minor release. Before `1.0`, upgrading
may require documented API changes.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability
reporting for this repository or email `engineering@inttegro.com` with:

- the affected package and version;
- a minimal reproduction or proof of concept;
- the expected and observed behavior; and
- any known impact or mitigations.

We will acknowledge the report, investigate it privately, and coordinate disclosure after a fix is
available. Do not include production credentials, customer data, or unrelated personal data.

## Security boundary

Cogni coordinates speculative reads. It does not authenticate users, grant access, or authorize a
resource. Hosts must apply the same identity, tenancy, authorization, validation, and cache-isolation
rules to predicted reads that they apply to foreground reads.
