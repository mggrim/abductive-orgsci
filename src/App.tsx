/**
 * App root: single ledger store instance provided to the whole tree
 * (single-source-of-state constraint), shell handles routing.
 */
import { LedgerProvider } from "./state/ledgerContext.tsx";
import { AppShell } from "./ui/AppShell.tsx";

export function App() {
  return (
    <LedgerProvider>
      <AppShell />
    </LedgerProvider>
  );
}
