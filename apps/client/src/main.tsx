import { createRoot } from "react-dom/client";
import "./styles.css";
import { Workspace } from "./workspace.js";

createRoot(document.getElementById("root")!).render(<Workspace />);
