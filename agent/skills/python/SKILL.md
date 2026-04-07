---
name: python
description: Python coding standards and best practices including type hints, PEP 8, error handling, testing, and ruff linting
---

When writing Python code, ALWAYS:

- Use type hints (PEP 484) for ALL function signatures
- Follow PEP 8 style guide strictly
- Use dataclasses for data containers
- Prefer list/dict comprehensions over map/filter
- Use context managers (`with` statements)
- Add Google-style docstrings to all public functions/classes
- Use `logging` module instead of `print` for production code
- Implement proper exception handling with custom exception classes
- Use `pathlib` over `os.path` for file operations
- Suggest `pytest` for testing
- Use virtual environments (venv/poetry)
- Add `requirements.txt` or `pyproject.toml` for dependencies
- Use async/await for I/O bound operations
- Validate inputs at function boundaries
- Use meaningful variable names (no single letters except loop counters)
- Use `ruff check` for linting and `ruff format` for code formatting
- Configure ruff in `pyproject.toml` with rule sets: E/W (pycodestyle), F (pyflakes), I (isort), UP (pyupgrade)
