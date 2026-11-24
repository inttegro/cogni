import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { useRouteIntent } from "@inttegro/cogni-react";

const routes = {
  "/orders": () => import("./routes/Orders"),
  "/products": () => import("./routes/Products"),
} as const;

type Route = keyof typeof routes;

export function App() {
  const [content, setContent] = useState<ReactNode>(
    <p>Move toward a destination. Cogni can begin loading before you commit.</p>,
  );

  const navigate = useCallback(async (route: Route) => {
    const module = await routes[route]();
    history.pushState({}, "", route);
    setContent(<module.default />);
  }, []);

  return (
    <main>
      <p className="eyebrow">Plain React</p>
      <h1>Bring your own navigation</h1>
      <nav aria-label="Demo destinations">
        <PredictiveAnchor href="/orders" onNavigate={navigate}>
          Orders
        </PredictiveAnchor>
        <PredictiveAnchor href="/products" onNavigate={navigate}>
          Products
        </PredictiveAnchor>
      </nav>
      <section>{content}</section>
    </main>
  );
}

function PredictiveAnchor({
  href,
  children,
  onNavigate,
}: {
  href: Route;
  children: ReactNode;
  onNavigate: (route: Route) => Promise<void>;
}) {
  const prefetchRoute = useCallback(async (route: string) => {
    const load = routes[route as Route];
    if (!load) return { materialWork: false };
    await load();
    return { materialWork: true };
  }, []);
  const intent = useRouteIntent({
    href,
    prefetchRoute,
    probability: 0.9,
    horizonMs: 30_000,
    policy: "demo-navigation",
  });

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    intent.runNow("click");
    try {
      await onNavigate(href);
      intent.commit();
    } catch {
      intent.cancel();
    }
  }

  return (
    <a
      href={href}
      onPointerEnter={intent.scheduleHover}
      onPointerLeave={intent.cancel}
      onPointerDown={() => intent.runNow("pointer")}
      onFocus={() => intent.runNow("focus")}
      onBlur={intent.cancel}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
