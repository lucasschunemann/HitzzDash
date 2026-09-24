import { Home, LayoutGrid, Sparkles, Users, PenLine, Settings } from "lucide-react";

export const NAV = [
  { href: "/", label: "Hoje", short: "Hoje", icon: Home },
  { href: "/videos", label: "Vídeos", short: "Vídeos", icon: LayoutGrid },
  { href: "/patterns", label: "Padrões", short: "Padrões", icon: Sparkles },
  { href: "/accounts", label: "Concorrentes", short: "Contas", icon: Users },
  { href: "/scripts", label: "Roteiros", short: "Roteiros", icon: PenLine },
  { href: "/settings", label: "Configurações", short: "Ajustes", icon: Settings },
];

export function navFor(pathname: string) {
  return NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) ?? null;
}
