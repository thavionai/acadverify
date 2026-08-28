# Atlas Agent Context Pack v3

This package is designed to be copied into:

```text
atlas/docs/context/
```

It contains focused engineering context files for Codex, Claude Code, Cursor, Gemini CLI, and similar AI coding agents.

## How to Use

Always load:

```text
00-agent-rules.md
```

Then load only the subsystem files related to the implementation task.

## Recommended Loading Examples

Ontology task:

```text
00-agent-rules.md
01-ontology-engine.md
02-ontology-as-code.md
03-metadata-catalog.md
```

Agent runtime task:

```text
00-agent-rules.md
30-agent-registry.md
31-agent-runtime.md
35-memory-system.md
36-evaluation-framework.md
```

Databricks migration task:

```text
00-agent-rules.md
52-databricks-migration.md
55-validation-framework.md
56-dual-run-framework.md
57-ai-migration-agent.md
```

## Important

Do not load all files for normal coding tasks. Selective loading improves agent quality and reduces token usage.
# acadverify
