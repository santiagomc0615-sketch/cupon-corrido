"use client";
/* Riel de navegación lateral (barra superior en celular). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { Guilloche, SELLO } from "./Guilloche";
import { SelectorTema } from "./SelectorTema";

const SECCIONES: { href: string; nombre: string; icono: ReactNode }[] = [
  { href: "/mercado", nombre: "Mercado", icono: <path d="M3 20h18M5 16l4-5 4 3 6-8" /> },
  {
    href: "/calculadora",
    nombre: "Calculadora",
    icono: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2" />
      </>
    ),
  },
  { href: "/portafolio", nombre: "Portafolio", icono: <path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" /> },
  {
    href: "/curva",
    nombre: "Curva TES",
    icono: (
      <>
        <path d="M3 19c3-8 7-11 18-13M3 21h18" />
        <circle cx="8" cy="13" r="1" />
        <circle cx="14" cy="8.5" r="1" />
      </>
    ),
  },
  {
    href: "/asesor",
    nombre: "Asesor IA",
    icono: (
      <>
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </>
    ),
  },
  {
    href: "/noticias",
    nombre: "Noticias y fuentes",
    icono: <path d="M4 5h12v14H4zM16 9h4v8a2 2 0 0 1-4 0M7 9h6M7 12h6M7 15h4" />,
  },
  {
    href: "/datos",
    nombre: "Cargar datos",
    icono: (
      <>
        <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
        <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
      </>
    ),
  },
];

export function Riel() {
  const ruta = usePathname();
  return (
    <aside className="rail">
      <Link href={BRAND.inicio} className="brand" aria-label={`${BRAND.nombre}, inicio`}>
        <Guilloche opt={SELLO} size={88} />
        <div>
          <b>{BRAND.nombre}</b>
          <small>{BRAND.eslogan}</small>
        </div>
      </Link>
      <nav className="nav" aria-label="Secciones">
        {SECCIONES.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={ruta.startsWith(s.href) ? "page" : undefined}
            title={s.nombre}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {s.icono}
            </svg>
            <span>{s.nombre}</span>
            <i className="k">{String(i + 1).padStart(2, "0")}</i>
          </Link>
        ))}
      </nav>
      <div className="rail-foot">
        <SelectorTema />
        <div>{BRAND.avisoLegal}</div>
      </div>
    </aside>
  );
}
