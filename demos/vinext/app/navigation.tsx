"use client";

import { PredictiveLink, VinextCogniProvider } from "@inttegro/cogni-vinext";

export function Navigation() {
  return (
    <VinextCogniProvider opaqueUserKey="demo-user">
      <nav aria-label="Demo destinations">
        <PredictiveLink href="/">Home</PredictiveLink>
        <PredictiveLink href="/orders">Orders</PredictiveLink>
      </nav>
    </VinextCogniProvider>
  );
}
