import React from "react";
import ReactDOM from "react-dom/client";
import "overlayscrollbars/styles/overlayscrollbars.css";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import App from "./App";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { I18nProvider } from "@/components/I18nProvider";
import { AuthProvider } from "@/auth";
import { DocumentStoreProvider } from "@/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

gsap.registerPlugin(useGSAP);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
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
      </AppErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);
