# PI Agent Configuration

Personal configuration for the [PI Coding Agent](https://github.com/badlogic/pi-mono), a terminal-based AI coding assistant.

This repository contains skills, model configurations, and coding standards used across my development environments.

## Structure

```
.pi/
├── agent/
│   ├── models.json       Provider and model definitions
│   ├── settings.json     Default model and thinking level
│   ├── AGENTS.md         Coding standards and behavior rules
│   ├── skills/           High-performance skill modules
│   ├── auth.json         Authentication tokens (gitignored)
│   ├── sessions/         Conversation history (gitignored)
│   └── bin/              Downloaded tools (gitignored)
├── .gitignore
└── README.md
```

## What Is Tracked

Files in this repository define how the PI agent behaves:

- **models.json** - API provider endpoints, model specifications, and context window settings
- **settings.json** - Default model selection and thinking level
- **AGENTS.md** - Global instructions for code quality, architecture, and communication
- **skills/** - Domain-specific coding skill modules following the Agent Skills spec

## What Is Not Tracked

The following are excluded via `.gitignore` because they contain personal data or are machine-specific:

- **auth.json** - OAuth tokens and API credentials
- **sessions/** - Full conversation history with the agent
- **bin/** - Downloaded binary tools (fd, rg, etc.)

## Setup

Clone this repository to your home directory:

```bash
git clone https://github.com/SujitRoy/.pi.git ~/.pi
```

Then configure your own provider in `agent/models.json` and authenticate PI:

```bash
pi /login
```

## Models

The current configuration defines a custom provider (`sujitroy`) with the following models:

| Model ID | Description | Context | Reasoning |
|----------|-------------|---------|-----------|
| qwen3-coder-plus | Balanced coding model | 128K | Yes |
| qwen3-coder-flash | Fast model for simple tasks | 128K | No |
| coder-model | Deep reasoning model | 256K | Yes |
| qwen3.5-plus | Alias for coder-model | 256K | Yes |

## Skills

Seven high-performance skill modules are included, optimized for minimal token usage and strong agentic behavior:

| Skill | Purpose |
|-------|---------|
| **execute** | Task execution with inspection, direct action, and end-to-end completion |
| **coding** | Write and edit code following repo conventions with smallest complete changes |
| **debug** | Root-cause analysis for bugs, errors, failures, and unexpected behavior |
| **review** | Code review focused on correctness, security, performance, maintainability, and tests |
| **test** | Add and improve tests matching existing framework and style |
| **plan** | Create short outcome-oriented plans for complex, ambiguous, or risky tasks |
| **refactor** | Improve code structure without changing intended behavior |

## Skill Format

Skills follow the [Agent Skills](https://github.com/marcfargas/skills) specification:

- Each skill is a directory containing a `SKILL.md` file
- The skill `name` in frontmatter must match the directory name
- Skills include a `description` for discovery

```
skills/
  coding/
    SKILL.md        # name: coding (matches directory)
  debug/
    SKILL.md        # name: debug (matches directory)
```

## Adding Your Own Skills

Create a directory with a `SKILL.md` file inside `agent/skills/`:

```
agent/skills/docker/SKILL.md
agent/skills/react/SKILL.md
agent/skills/postgres/SKILL.md
```

Each `SKILL.md` must have YAML frontmatter with `name` and `description`:

```yaml
---
name: docker
description: Docker and container management best practices
---

When working with Docker:
- ...
```

## Syncing Across Machines

Push changes:

```bash
cd ~/.pi
git add .
git commit -m "description of changes"
git push
```

Pull on another machine:

```bash
cd ~/.pi
git pull
```

Re-authenticate on the new machine since `auth.json` is not tracked.

## License

MIT
