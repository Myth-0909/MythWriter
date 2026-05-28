import React from "react";
import ReactDOM from "react-dom/client";
import "overlayscrollbars/styles/overlayscrollbars.css";
import App from "./App";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { I18nProvider } from "@/components/I18nProvider";
import { AuthProvider } from "@/auth";
import { DocumentStoreProvider } from "@/store";
import { TooltipProvider } from "@/components/ui/tooltip";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <DocumentStoreProvider>
              <TooltipProvider>
                <App />
              </TooltipProvider>
            </DocumentStoreProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
);
