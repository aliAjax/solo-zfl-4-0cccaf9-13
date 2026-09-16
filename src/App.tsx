import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import LabPage from "@/pages/LabPage";
import ComparePage from "@/pages/ComparePage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/lab/compare" element={<ComparePage />} />
      </Routes>
    </Router>
  );
}
