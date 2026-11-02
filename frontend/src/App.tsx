import { Routes, Route } from "react-router-dom";
import LastNight from "@/pages/LastNight";
import Barracks from "@/pages/Barracks";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/barracks" element={<Barracks />} />
      <Route path="*" element={<LastNight />} />
    </Routes>
  );
}
