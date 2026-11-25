"use client";

import { NextCogniProvider, PredictiveLink } from "@inttegro/cogni-next";

export function Navigation() {
  return (
    <NextCogniProvider opaqueUserKey="demo-user">
      <nav aria-label="Demo destinations">
        <PredictiveLink href="/">Home</PredictiveLink>
        <PredictiveLink href="/orders">Orders</PredictiveLink>
      </nav>
    </NextCogniProvider>
  );
}
