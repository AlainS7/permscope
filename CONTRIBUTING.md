# Contributing to PermScope

Thanks for your interest in contributing to PermScope!

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/AlainS7/permscope.git
   cd permscope
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Compile the extension:

   ```bash
   pnpm run compile
   ```

4. Run the extension:
   - Open the project in VS Code
   - Press `F5` to launch the Extension Development Host

---

## Project Structure

- `src/` — extension source code
- `out/` — compiled JavaScript output
- `tests/fixtures/` — sample files for rule verification
- `tests/verify-fixtures.js` — checks compiled parsers and risk engine against fixtures

---

## Making Changes

- Add or update rules in the rule engine
- Keep explanations:
  - concise
  - accurate
  - actionable

---

## Testing

Run the fixture verifier:

```bash
pnpm run verify:fixtures
```

Add new test cases when introducing new rules.

---

## Code Style

- Keep logic simple and readable
- Avoid unnecessary dependencies
- Prefer explicit over clever

---

## Pull Requests

- Describe what your change does
- Include examples if behavior changes
- Keep PRs focused and small

---

## Reporting Issues

If you find a bug or have a feature request:

- Open an issue on GitHub
- Include a minimal reproducible example

---

## Roadmap

See the README for planned features.

---

Thanks for helping improve PermScope!
