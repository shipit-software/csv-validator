# CSV Validator maintenance

This is an independent local CSV validation tool. Keep runtime dependencies at
zero unless a useful change justifies them. Preserve strings and documented
quoting/delimiter behavior; never evaluate cell contents.

Run the affected implementation's tests in an isolated environment dedicated to
this repository. Use synthetic fixtures and verify diagnostic positions and CLI
exit codes. Do not infer platform support or performance from another platform's
results.

Never commit credentials, environment configuration, encryption keys, customer
data, unrelated source or internal documents. Keep all credential storage and
publication authentication outside this repository and its release archives.
Do not add secrets to public automation configuration.

Every public change requires an independent agent privacy and credential review
of the exact source and complete reachable Git history before pushing. Before
publication, independently review the actual release archives and their complete
file lists, including generated files. Review must cover accidental sensitive
content as well as executable code; a scanner alone is insufficient.

Create repositories, push changes or publish packages only within the maintainer's
explicitly authorized scope. Publication must use the exact reviewed contents,
package identity, version and destination. Preserve local publication hooks and
release safeguards. Do not add or enable publishing automation without explicit
maintainer authorization.

Keep package and repository links accurate. Link naturally to the relevant
browser tool page and published packages; describe each implementation's own
behavior without implying identical website source.
