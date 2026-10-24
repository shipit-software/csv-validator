# CSV Validator maintenance

This is an independent local CSV validation tool. Keep runtime dependencies at
zero unless a useful change justifies them. Preserve strings and documented
quoting/delimiter behavior; never evaluate cell contents.

Run `node --test test/*.test.mjs` in an environment dedicated to this repository.
Use synthetic fixtures and verify diagnostic positions and CLI exit codes.

Do not commit credentials, environment files, customer data, unrelated source,
internal documents or research. Review the complete Git history and actual
package contents before any publication. Creating a public remote, pushing or
publishing requires the owner's explicit approval of the concrete result.
Do not remove or bypass local publication hooks. Keep package publication disabled
until its exact contents, name and release workflow are approved.
