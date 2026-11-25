"use client";

import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider opaqueUserKey="demo-user">
      <nav aria-label="Demo destinations">
        <PredictiveLink href="/" probability={0.9} horizonMs={30_000}>
          Home
        </PredictiveLink>
        <PredictiveLink href="/orders" probability={0.92} horizonMs={30_000}>
          Orders
        </PredictiveLink>
      </nav>
    </NextCogniProvider>
  );
}
