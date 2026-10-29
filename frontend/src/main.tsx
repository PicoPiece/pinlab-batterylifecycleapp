import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { I18nProvider } from "./i18n";
import { initializeMobile } from "./mobile";
import "./styles.css";
import "./agency.css";
import "./mobile.css";

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <I18nProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </I18nProvider>
    </Router>
  </React.StrictMode>,
);

void initializeMobile();
