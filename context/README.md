# AOS — Context Engineering Directory

**All documentation for building AOS lives here.**

## Reading Order (mandatory for all agents)

1. `SpecDocs/product-brief.md` — Vision, users, principles, scope
2. `SpecDocs/prd.md` — Functional requirements, user stories, acceptance criteria
3. `SpecDocs/architecture.md` — System design, components, data flow, schemas
4. `SpecDocs/epics-and-stories.md` — Sprint-ready stories with dependencies
5. `SpecDocs/reference-mega-prompt.md` — Original ClaudeClaw spec (reference only, not gospel)

## Rules

- **Read specs before writing code.** Every story references the PRD and architecture.
- **Build in dependency order.** The epics have a dependency graph — follow it.
- **CLAUDE.md is the personality file.** Not SOUL.md. Standard Claude Code convention.
- **No empire features in v1.** Empire routing is a separate optional module.
- **Stability > features.** A working 10-feature assistant beats a broken 50-feature one.
- **context/** is for humans and agents. Keep it current as the project evolves.
- **scenarios/** is for QA holdout tests. Coding agents never read it.
