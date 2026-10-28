import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { Onca } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="pt-10">
      <Onca className="mx-auto block h-28 text-ink/85" />
      <EmptyState title="Não encontrado" action={<Link href="/" className="text-[13px] font-medium text-ink-2 hover:text-ink link-underline">Voltar para Hoje</Link>}>
        O vídeo ou página pode ter sido removido junto com a conta.
      </EmptyState>
    </div>
  );
}
