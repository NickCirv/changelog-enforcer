# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-02

### Added
- Initial release
- Pre-commit and pre-push hook installation
- Smart ignore patterns for docs, tests, config files
- Auto-suggested CHANGELOG entries from git diff
- Keep a Changelog format validation
- One-time bypass via `--bypass` flag
- `.changelog-enforcer.json` config file support
- `--generate` command to auto-generate CHANGELOG entry
- `--validate` command to validate existing CHANGELOG format
- `--since <ref>` to check changes since a specific commit
- Zero external dependencies — pure Node.js built-ins only
