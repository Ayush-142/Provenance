import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Workspace } from "./workspace.js";
import { SessionListPage } from "./instructor/SessionListPage.js";
import { SessionDetailPage } from "./instructor/SessionDetailPage.js";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Workspace />} />
      <Route path="/instructor" element={<SessionListPage />} />
      <Route path="/instructor/sessions/:sessionId" element={<SessionDetailPage />} />
    </Routes>
  </BrowserRouter>
);
