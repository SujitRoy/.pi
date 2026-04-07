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
│   ├── skills/           Domain-specific best practices
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
- **skills/*.md** - Domain-specific coding guidelines (Python, Git, REST APIs, etc.)

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

Then authenticate PI with your own credentials:

```bash
pi /login
```

Or configure your own provider in `agent/models.json` if you use a custom API endpoint.

## Models

The current configuration defines a custom provider (`sujitroy`) with the following models:

| Model ID | Description | Context | Reasoning |
|----------|-------------|---------|-----------|
| qwen3-coder-plus | Balanced coding model | 128K | Yes |
| qwen3-coder-flash | Fast model for simple tasks | 128K | No |
| coder-model | Deep reasoning model | 256K | Yes |
| qwen3.5-plus | Alias for coder-model | 256K | Yes |

## Skills

Three skills are included:

- **python.md** - Python type hints, PEP 8, error handling, testing conventions
- **git.md** - Conventional commits, branching strategy, cleanup practices
- **rest-api.md** - REST design, HTTP status codes, security, architecture patterns

## Adding Your Own Skills

Create markdown files in `agent/skills/`. Each file is automatically loaded as context when PI runs. For example:

```
agent/skills/docker.md
agent/skills/react.md
agent/skills/postgres.md
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
