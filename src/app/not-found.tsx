import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Não encontrado" action={<Link href="/" className="text-[13px] font-medium text-accent-ink hover:underline">Voltar para Hoje</Link>}>
      O vídeo ou página pode ter sido removido junto com a conta.
    </EmptyState>
  );
}
