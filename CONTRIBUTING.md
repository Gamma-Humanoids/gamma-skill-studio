# Contributing to Gamma Skill Studio

Thanks for your interest in contributing! This project is maintained by
[Gamma Lab](https://gammalab.ae/Home) and released under Apache-2.0.

## Development setup

```bash
git clone git@github.com:Gamma-Humanoids/gamma-skill-studio.git
cd gamma-skill-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
./run.sh
```

Open http://127.0.0.1:8766/ in a browser.

## Tests & lint

```bash
pytest tests/ -q
ruff check .
```

CI runs these on Python 3.10, 3.11, and 3.12 against every PR.

## Opening a pull request

1. Fork, branch, commit. We recommend [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
2. Keep PRs focused — one logical change per PR.
3. Add or update tests for any behaviour change.
4. Update `CHANGELOG.md` under an `## [Unreleased]` section.
5. Make sure the CI is green before requesting review.

## Code of Conduct

Be kind, specific, and constructive. Harassment of any kind is not tolerated.

## Licensing

By submitting a pull request, you agree that your contribution is licensed
under the [Apache License 2.0](LICENSE), the same license that covers the
rest of this project. No CLA is required — the Apache-2.0 grant in the
license itself is sufficient.

## Reporting issues

Use [GitHub Issues](https://github.com/Gamma-Humanoids/gamma-skill-studio/issues).
When filing a bug, please include: OS, Python version, `pip freeze`, and
the minimal steps to reproduce.
