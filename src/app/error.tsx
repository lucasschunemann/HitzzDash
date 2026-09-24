"use client";

import { EmptyState, Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState title="Algo deu errado nesta tela" action={<Button onClick={reset}>Tentar de novo</Button>}>
      {error.message}
    </EmptyState>
  );
}
