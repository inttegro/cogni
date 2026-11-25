import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-react-router";

import "./styles.css";

const routeModules = {
  "/orders": () => import("./routes/Orders"),
  "/products": () => import("./routes/Products"),
} as const;

const router = createBrowserRouter([
  {
    path: "/",
    Component: Shell,
    children: [
      { index: true, Component: Home },
      { path: "orders", lazy: routeModules["/orders"] },
      { path: "products", lazy: routeModules["/products"] },
    ],
  },
]);

function Shell() {
  return (
    <CogniProvider opaqueUserKey="demo-user">
      <main>
        <p className="eyebrow">React Router</p>
        <h1>Preload the route the router will use</h1>
        <nav aria-label="Demo destinations">
          <DemoLink to="/orders">Orders</DemoLink>
          <DemoLink to="/products">Products</DemoLink>
        </nav>
        <section>
          <Outlet />
        </section>
      </main>
    </CogniProvider>
  );
}

function Home() {
  return <p>Hover or focus a destination, then navigate.</p>;
}

function DemoLink({
  to,
  children,
}: {
  to: keyof typeof routeModules;
  children: string;
}) {
  return (
    <PredictiveLink
      to={to}
      prefetchRoute={async (href) => {
        const load = routeModules[href as keyof typeof routeModules];
        if (!load) return { materialWork: false };
        await load();
        return { materialWork: true };
      }}
    >
      {children}
    </PredictiveLink>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
