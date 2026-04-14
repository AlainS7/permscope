# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-13

### Added

- Initial PermScope VS Code extension: static analysis of command-like strings in JSON and YAML (no execution, no network).
- Inline decorations by risk level (high / medium / low).
- Hover explanations with structured, actionable copy.
- Problems panel integration for high and medium findings; low severity kept to inline/hover only.
- Status bar summary with a shortcut to open the Problems view when relevant diagnostics exist.
- `PermScope: Open Problems` command.
- Parsers and rules for common cases, including:
  - `package.json` script values
  - JSON `permissions.allow` style strings (e.g. Claude-style configs)
  - YAML `run:` steps (e.g. GitHub Actions)
- Fixture-based verification script (`pnpm run verify:fixtures`).

[0.1.0]: https://github.com/AlainS7/permscope
