import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

/** Ligne de navigation (icône, titre, détail, chevron), kit V3. */
export function LinkRow({ href, icon, title, sub, className }: { href: string; icon: IconName; title: string; sub?: string; className?: string }) {
  return (
    <li>
      <Link href={href} className={className ? `row ${className}` : "row"}>
        <span className="row-icon"><Icon name={icon} /></span>
        <span className="row-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
        <Icon name="chevron" className="row-chevron" />
      </Link>
    </li>
  );
}
