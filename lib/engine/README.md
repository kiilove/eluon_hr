# External Engine Architecture

## Principles
As per user directive (2026-01-06), all new logic must be implemented as an **External Engine**.

1.  **Isolation**: Core business logic (calculations, simulations, data generation) must reside in `lib/engine/*.ts` (or similar isolated modules).
2.  **Non-Destructive**: Do NOT modify existing critical files (`App.tsx`, `Layout.tsx`, existing Services) unless absolutely necessary to trigger the engine or display results.
3.  **Result-Oriented**: The "Engine" should produce data/results (e.g., JSON, DB records). The main application only consumes these results for "Final Reflection" (Rendering/Persistence).

## Structure
-   `lib/engine/`: Directory for standalone logic modules.
-   `functions/api/`: API endpoints that *call* the engine and return results.
-   UI Components: Simple consumers of the API results.

## Example Flow
`UI (Trigger)` -> `API Endpoint` -> `Engine (Logic)` -> `Database (Store Result)` -> `UI (Display Result)`
