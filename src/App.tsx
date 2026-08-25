import { Routes, Route } from "react-router";
import Desktop from "./desktop/Desktop";

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Desktop />} />
    </Routes>
  );
}
