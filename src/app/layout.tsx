import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "MGW Importer",
  description: "MGW multi-sucursal importer and exporter"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
