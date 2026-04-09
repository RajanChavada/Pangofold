import { Routes, Route } from "react-router";
import { Landing } from "./pages/Landing";
import { TripView } from "./pages/TripView";
import { TripEdit } from "./pages/TripEdit";
import { SharedView } from "./pages/SharedView";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trip/:id" element={<TripView />} />
      <Route path="/trip/:id/edit" element={<TripEdit />} />
      <Route path="/s/:slug" element={<SharedView />} />
    </Routes>
  );
}
