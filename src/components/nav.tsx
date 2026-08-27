"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Resumen" },
  { href: "/salario", label: "Salario" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/recurrentes", label: "Fijos y subs" },
  { href: "/calendario", label: "Calendario" },
  { href: "/ajustes", label: "Ajustes" },
];

export function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-1.5 transition ${
              active ? "bg-white/10 text-white" : "text-muted hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
