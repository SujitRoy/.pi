# PI Agent Configuration

Personal skills, model configurations, and coding standards for the [PI Coding Agent](https://github.com/badlogic/pi-mono), a terminal-based AI coding assistant.

## Structure

```
.pi/
├── agent/
│   ├── models.json       Provider and model definitions (gitignored)
│   ├── settings.json     Default model and thinking level
│   ├── AGENTS.md         Coding standards and behavior rules
│   ├── skills/           High-performance skill modules
│   ├── extensions/       JavaScript extensions (callable tools)
│   ├── auth.json         Authentication tokens (gitignored)
│   ├── sessions/         Conversation history (gitignored)
│   └── bin/              Downloaded tools (gitignored)
├── scripts/
│   ├── patch-agentrouter.ps1   Windows patch for AgentRouter
│   ├── patch-agentrouter.sh    Linux/macOS patch for AgentRouter
│   └── README.md               Patch documentation
├── .gitignore
└── README.md
```

## What Is Tracked

Files in this repository define how the PI agent behaves:

- **settings.json** - Default model and thinking level
- **AGENTS.md** - Global instructions for code quality, architecture, and communication
- **skills/** - 17 domain-specific skill modules following the Agent Skills spec
- **scripts/** - Reusable patch scripts for known provider issues

## What Is Not Tracked

The following are excluded via `.gitignore` because they contain personal data or are machine-specific:

- **models.json** - API provider endpoints, keys, and model specifications
- **auth.json** - OAuth tokens and API credentials
- **sessions/** - Full conversation history with the agent
- **bin/** - Downloaded binary tools (fd, rg, etc.)

## Setup

Clone this repository to your home directory:

```bash
git clone https://github.com/SujitRoy/.pi.git ~/.pi
```

Then configure your own providers in `agent/models.json` (create it if it does not exist) and authenticate PI:

```bash
pi /login
```

Each provider in `models.json` needs:
- `baseUrl` - API endpoint
- `apiKey` - Your API token
- `api` - Provider type (usually `openai-completions`)
- `models` - Array of available models with context, reasoning, and token settings

## Skills

17 high-performance skill modules are included, optimized for minimal token usage and strong agentic behavior:

| Skill | Purpose |
|-------|---------|
| **execute** | Task execution with inspection, direct action, and end-to-end completion |
| **coding** | Write and edit code following repo conventions with smallest complete changes |
| **debug** | Root-cause analysis for bugs, errors, failures, and unexpected behavior |
| **review** | Code review focused on correctness, security, performance, maintainability, and tests |
| **test** | Add and improve tests matching existing framework and style |
| **plan** | Create short outcome-oriented plans for complex, ambiguous, or risky tasks |
| **refactor** | Improve code structure without changing intended behavior |
| **security** | Vulnerability identification, secure patterns, OWASP validation |
| **documentation** | Clear, concise, accurate technical documentation with examples |
| **performance** | Profile, identify bottlenecks, optimize, measure, and validate |
| **git** | Conventional commits, feature branches, clean history, semantic versioning |
| **infrastructure** | Docker, CI/CD, cloud deployment, infrastructure-as-code |
| **data** | Database design, migrations, queries, and data integrity |
| **api** | REST API design, contracts, versioning, and endpoint conventions |
| **architecture** | System design, patterns, boundaries, and structural decisions |
| **observability** | Logging, metrics, tracing, and alerting for production systems |
| **frontend** | UI development, accessibility, responsiveness, and client-side best practices |

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

## Extensions

Extensions are JavaScript modules that add callable tools to the PI agent.

### Web Search Extension

Enables live web search and URL content fetching via a [SearXNG](https://github.com/searxng/searxng) instance.

**Available Tools:**

| Tool | Purpose |
|------|---------|
| `web_search` | Search the web with depth modes (fast, standard, deep) |
| `fetch_content` | Extract readable content from any URL |

**Installation:**

1. Configure your SearXNG URL in `.env` (see `.env.example`):
   ```
   SEARXNG_BASE_URL=http://your-searxng-host:port
   ```

2. Install the extension:
   ```bash
   pi install ./agent/extensions/web-search.js
   ```

3. Verify installation:
   ```bash
   pi list
   ```

**Usage Examples:**
```javascript
// Search the web
web_search({ query: "TypeScript 5.0 features", depth: "standard" })
web_search({ query: "latest AI news", category: "news", depth: "deep" })

// Fetch content from a URL
fetch_content({ url: "https://example.com/article" })
fetch_content({ url: "https://docs.python.org/3/tutorial", prompt: "How do decorators work?" })
fetch_content({ url: "https://example.com/long-article", maxLength: 5000 })
```

**Security Features:**
- SSRF protection (blocks internal/private network URLs)
- Content-Type validation (text-based content only)
- Automatic redirect following (up to 5 hops)
- Intelligent caching (5-min TTL)

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

Re-configure `agent/models.json` and re-authenticate on the new machine since those files are not tracked.

## License

MIT
