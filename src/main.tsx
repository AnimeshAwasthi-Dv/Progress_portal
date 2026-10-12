import React from "react";
import ReactDOM from "react-dom/client";
import Entry from "./Entry";
import "./index.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";

const root = document.getElementById("root")!;
const application = (
  <React.StrictMode>
    <Entry />
  </React.StrictMode>
);

if (root.hasChildNodes()) ReactDOM.hydrateRoot(root, application);
else ReactDOM.createRoot(root).render(application);
