import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { CogniProvider } from "@inttegro/cogni-react";
import { PredictiveLink } from "@inttegro/cogni-tanstack-router";

import "./styles.css";

const rootRoute = createRootRoute({ component: Shell });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <p>Hover or focus the orders destination, then navigate.</p>,
});
const ordersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders",
  loader: async () => ({ orders: ["Order 1042", "Order 1041"] }),
  component: Orders,
});
const routeTree = rootRoute.addChildren([indexRoute, ordersRoute]);
const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function Shell() {
  return (
    <CogniProvider opaqueUserKey="demo-user">
      <main>
        <p className="eyebrow">TanStack Router</p>
        <h1>Let the router own reusable route data</h1>
        <nav aria-label="Demo destinations">
          <PredictiveLink to="/">Home</PredictiveLink>
          <PredictiveLink to="/orders">Orders</PredictiveLink>
        </nav>
        <section>
          <Outlet />
        </section>
      </main>
    </CogniProvider>
  );
}

function Orders() {
  const { orders } = ordersRoute.useLoaderData();
  return (
    <ul>
      {orders.map((order) => (
        <li key={order}>{order}</li>
      ))}
    </ul>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
