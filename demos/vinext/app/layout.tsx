import type { ReactNode } from "react";

import { Navigation } from "./navigation";
import "./styles.css";

export const metadata = {
  title: "Cogni Vinext demo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <p className="eyebrow">Vinext</p>
          <h1>Predict App Router work on Vite</h1>
          <Navigation />
          <section>{children}</section>
        </main>
      </body>
    </html>
  );
}
