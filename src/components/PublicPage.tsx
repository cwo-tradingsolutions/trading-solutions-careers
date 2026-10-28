"use client";

import { useEffect, ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

/**
 * Envoltorio de las páginas públicas (home, vacantes, detalle): shell
 * Universe About (`.uv`, ver styles/universe-shell.css).
 *
 * El layout raíz declara `lang="es"` porque lo comparte con HR Admin, que va
 * en español. El portal público va en inglés: se marca el bloque con
 * `lang="en"` y, ya en el navegador, también el <html>, para que lectores de
 * pantalla y el traductor del navegador no lo traten como español.
 */
export default function PublicPage({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const previo = html.lang;
    html.lang = "en";
    return () => {
      html.lang = previo;
    };
  }, []);

  return (
    <div lang="en" className="uv">
      <Navbar />
      <main className="page">{children}</main>
      <Footer />
    </div>
  );
}
