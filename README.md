<div align="center">

# changelog-enforcer

**Block commits that forget to update the changelog — enforce documentation discipline on every push.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/changelog-enforcer
```

## Usage

```bash
# Check staged changes against CHANGELOG.md
npx github:NickCirv/changelog-enforcer

# Install as a git pre-commit hook (runs automatically on every commit)
npx github:NickCirv/changelog-enforcer --hook pre-commit
```

| Flag | Description |
|---|---|
| _(none)_ | Check staged changes |
| `--staged` | Explicitly check staged changes |
| `--since <ref>` | Check changes since a git ref (e.g. `HEAD~5`) |
| `--hook pre-commit` | Install git pre-commit hook |
| `--hook pre-push` | Install git pre-push hook |
| `--remove-hook` | Remove installed hook(s) |
| `--validate` | Validate CHANGELOG.md format (Keep a Changelog) |
| `--generate` | Generate a CHANGELOG entry from staged changes |
| `--bypass` | Skip enforcement once (consumed on next commit) |

## What it does

Reads your staged (or recently committed) files and checks whether `CHANGELOG.md` was also modified. If source files changed but the changelog did not, the commit is blocked and a suggested entry is printed. Docs, tests, and lock files are ignored by default so you only get blocked when it genuinely matters.

Configure ignored paths and behaviour via `.changelog-enforcer.json` in your project root.

---

<sub>Zero dependencies · Node 18+ · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
