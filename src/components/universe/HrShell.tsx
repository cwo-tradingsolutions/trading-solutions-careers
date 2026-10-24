"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import UniverseMark from "./Mark";

type HashItem = { kind: "hash"; id: string; label: string };
type PathItem = { kind: "path"; href: string; label: string };
type NavItem = HashItem | PathItem;

const PRIMARY: NavItem[] = [
  { kind: "hash", id: "dashboard", label: "Tablero" },
  { kind: "hash", id: "funnel", label: "Candidatos" },
  { kind: "hash", id: "vacantes", label: "Vacantes" },
  { kind: "hash", id: "requisiciones", label: "Requisiciones" },
  { kind: "hash", id: "onboarding", label: "Inducción" },
  { kind: "hash", id: "cvbank", label: "Banco de HV" },
  { kind: "hash", id: "rubricas", label: "Rúbricas" },
  { kind: "hash", id: "nuevebox", label: "Decisiones" },
  { kind: "hash", id: "plantillas", label: "Ajustes" },
];

const MORE: NavItem[] = [
  { kind: "path", href: "/hr-admin/trazabilidad", label: "Reportes" },
  { kind: "path", href: "/hr-admin/reclutadores", label: "Equipo" },
  { kind: "path", href: "/hr-admin/bateria", label: "Pruebas" },
  { kind: "path", href: "/hr-admin/pruebas-externas", label: "Pruebas externas" },
];

function hrefFor(item: NavItem) {
  return item.kind === "hash" ? `/hr-admin#${item.id}` : item.href;
}

export default function HrShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [hash, setHash] = useState("dashboard");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const read = () => setHash(window.location.hash.replace("#", "") || "dashboard");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  if (pathname === "/hr-admin/login") {
    return <>{children}</>;
  }

  const isActive = (item: NavItem) => {
    if (item.kind === "path") {
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }
    if (pathname !== "/hr-admin") return false;
    return (hash || "dashboard") === item.id;
  };

  const onNav = (event: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    setOpen(false);
    if (item.kind !== "hash" || pathname !== "/hr-admin") return;
    event.preventDefault();
    const next = item.id;
    if ((window.location.hash.replace("#", "") || "dashboard") !== next) {
      window.location.hash = next;
    }
    setHash(next);
  };

  const links = (items: NavItem[]) =>
    items.map((item) => (
      <Link
        key={hrefFor(item)}
        href={hrefFor(item)}
        className="ts-side-link"
        aria-current={isActive(item) ? "page" : undefined}
        onClick={(event) => onNav(event, item)}
      >
        {item.label}
      </Link>
    ));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[var(--ts-sidebar)_minmax(0,1fr)]">
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 ts-scrim md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`ts-sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col gap-7 px-4 py-6 transition-transform duration-200 md:sticky md:top-0 md:z-30 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-2">
          <Link href="/hr-admin" className="flex items-center gap-3 text-sm text-white" onClick={() => setOpen(false)}>
            <UniverseMark tone="on-dark" />
            <span>Careers</span>
          </Link>
          <button type="button" className="md:hidden text-white/70 p-1" onClick={() => setOpen(false)} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Navegación">
          {links(PRIMARY)}
          <div className="my-3 mx-2 h-px bg-white/10" />
          {links(MORE)}
        </nav>
        <div className="rounded-ts-md border border-white/10 bg-white/5 px-3 py-3 text-xs text-white/55">
          <strong className="block font-medium text-white mb-1">Espacio · Trading</strong>
          Careers
        </div>
      </aside>
      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ts-hairline bg-ts-canvas px-4 md:hidden">
          <button type="button" onClick={() => setOpen(true)} className="p-1.5 text-ts-ink" aria-label="Abrir menú">
            <Menu size={20} />
          </button>
          <UniverseMark />
          <span className="text-sm">Careers</span>
        </div>
        {children}
      </div>
    </div>
  );
}
