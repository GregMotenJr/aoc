# Contributing to AOS

## Branching

| Branch | Purpose |
|--------|---------|
| `main` | Stable, released code only |
| `dev` | Active development — all PRs target this |

All work goes through a PR. Direct pushes to `main` are blocked.

---

## Commit Messages — Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <description>
```

### Types

| Type | Version bump | When to use |
|------|-------------|-------------|
| `feat` | **minor** (1.**x**.0) | New feature |
| `fix` | **patch** (1.0.**x**) | Bug fix |
| `perf` | **patch** | Performance improvement |
| `docs` | none | Documentation only |
| `style` | none | Formatting, whitespace |
| `refactor` | none | Code restructure, no behavior change |
| `test` | none | Adding or fixing tests |
| `ci` | none | CI/CD pipeline changes |
| `build` | none | Build system, dependencies |
| `chore` | none | Maintenance, tooling |
| `revert` | depends | Reverts a previous commit |

### Breaking changes → major bump

Append `!` to the type or add `BREAKING CHANGE:` in the footer:

```text
feat!: redesign memory storage schema

BREAKING CHANGE: existing .db files must be migrated with `npm run migrate`
```

### Examples

```text
feat: add /schedule pause and resume commands
fix: resolve cron-parser ESM import on Node 22
docs: update Windows install instructions
ci: add E2E test stage to pipeline
refactor(memory): extract salience decay into standalone function
feat(voice)!: switch STT provider from Groq to Whisper local
```

---

## Semantic Versioning

AOS follows [semver](https://semver.org): `MAJOR.MINOR.PATCH`

| Change | Example | Version |
|--------|---------|---------|
| Breaking API or schema change | Redesigned DB schema | `2.0.0` |
| New feature, backward compatible | New `/backup` command | `1.1.0` |
| Bug fix, backward compatible | Fix stale PID crash | `1.0.1` |

---

## PR Process

1. Branch off `dev`
2. Write code + tests
3. PR title must follow Conventional Commits (CI enforces this)
4. All CI stages must pass (Build → Unit → Integration → E2E if secrets set)
5. CodeRabbit review — address all actionable comments before merge
6. Squash merge into `dev`

---

## Cutting a Release

1. Bump version in `package.json` on `dev`
2. Update `CHANGELOG.md` — move `[Unreleased]` items under the new version header
3. Open PR from `dev → main` with title: `chore: release vX.Y.Z`
4. Merge after approval
5. Tag the release:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
6. The release pipeline runs automatically:
   - Validates semver tag matches `package.json`
   - Runs full test suite
   - Creates GitHub Release with auto-generated changelog
   - Publishes to npm (if version is new)

---

## Running Tests Locally

```bash
npm test                  # Unit tests (70 tests)
npm run build             # TypeScript compile
npm run typecheck         # Type-check without emitting
npm run status            # Health check
shellcheck install.sh     # Shell script lint
```
