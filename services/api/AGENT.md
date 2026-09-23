# AGENT Rules

## API Change Discipline

When adding or changing any API route, the same change must update all of the following in the same task:

- `openapi.yml`
- `docs/api_route_matrix.md`

This rule applies whenever any of these change:

- route name or path
- HTTP method
- auth requirement
- request format
- response structure

## Route Documentation Expectation

`docs/api_route_matrix.md` is the human-facing route comparison table.

For each changed route, keep these fields current:

- Rust external route
- downstream agent route if proxied
- method
- auth expectation
- short purpose
- response shape summary
- legacy alias or migration note if one exists

Do not leave route behavior changed in code while `openapi.yml` or `docs/api_route_matrix.md` still describe the old contract.
