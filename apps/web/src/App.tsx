import { Routes, Route } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { TripView } from "./pages/TripView";
import { TripEdit } from "./pages/TripEdit";
import { SharedView } from "./pages/SharedView";
import { TripReport } from "./pages/TripReport";

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trip/:id" element={<TripView />} />
        <Route path="/trip/:id/edit" element={<TripEdit />} />
        <Route path="/trip/:id/report" element={<TripReport />} />
        <Route path="/s/:slug" element={<SharedView />} />
      </Routes>
    </ErrorBoundary>
  );
}
