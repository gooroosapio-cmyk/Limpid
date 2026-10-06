"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { downloadPdf } from "./pdf-download";

/** Ligne « Télécharger le PDF » avec retour immédiat (préparation puis lancement). */
export function PdfLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  const t = useT();
  return (
    <a
      href={href}
      className="row"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        void downloadPdf(href, t);
      }}
    >
      <span className="row-icon"><Icon name="download" /></span>
      <span className="row-text"><b>{title}</b><small>{sub}</small></span>
      <Icon name="chevron" className="row-chevron" />
    </a>
  );
}
