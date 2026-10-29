# Engineering Rules & Guidelines

## 1. File & Codebase Exploration

- **Primary Tool**: Use `codegraph` as the first choice for inspecting symbols, dependencies, project structure, callers, callees, and architectural flow.
- **Initialization**: If the repository does not have an active `.codegraph/` index, run `codegraph init` first.
- **Fallback**: If `codegraph` fails, is unindexed, or is insufficient for literal pattern matching or asset inspection, fall back to standard terminal tools (`find`, `grep`, `ls`, file reader tools).

## 2. Repository Architecture

- **Standard Default**: While Hexagonal Architecture (Ports and Adapters) is our default paradigm for large backend systems, it is **not required** for this project given the compact scope of the script/service.
- **Pragmatic Simplicity**: Avoid premature abstractions, redundant mapping layers, or unnecessary boilerplate. Keep modules strongly typed, and straightforward.

## 3. Validation & Verification Pipeline

Always adhere to the following order of execution when validating work:
1. **Tests First**: Run automated tests via `pnpm run test:run` (Vitest) to confirm functional correctness and catch behavioral regressions early.
2. **Build & Type Compilation**: Run `pnpm run type-check` followed by `pnpm run build` (`tsc -p tsconfig.build.json`) to verify strict TypeScript typing and error-free build output.
3. **Lint & Code Style**: Run `pnpm run lint` and `pnpm run format:check` (Biome) to ensure clean code standards and consistent formatting.

## 4. Requirement & Edge-Case Definition

- **Clarify Before Implementing**: Never write production code based on assumptions. Always specify and confirm precise system requirements with the user beforehand.
- **Edge-Case Mapping**: Identify boundary conditions, error handling paths, and edge cases prior to development.
- **Deterministic Testing**: Design tests around these edge cases to guarantee deterministic behavior (no arbitrary sleeps, explicit assertions, and controlled execution environments).
