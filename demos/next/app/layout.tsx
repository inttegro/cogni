import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Navigation } from "./navigation";
import "./styles.css";

export const metadata: Metadata = {
  title: "Cogni Next.js demo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <p className="eyebrow">Next.js</p>
          <h1>Start App Router work before navigation</h1>
          <Navigation />
          <section>{children}</section>
        </main>
      </body>
    </html>
  );
}
