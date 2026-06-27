import { AppProviders } from "./app/AppProviders";
import { AppRouter } from "./app/router";

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
