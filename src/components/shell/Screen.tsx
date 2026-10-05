import { TopBar } from "./TopBar";

/** Écran standard : en-tête puis contenu centré, entrée animée. */
export function Screen({
  title,
  back,
  actions,
  root = false,
  wide = false,
  className,
  children,
}: {
  title?: string;
  back?: string;
  actions?: React.ReactNode;
  root?: boolean;
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = ["page", "page-enter", root ? "with-rootnav" : "", wide ? "page-wide" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <>
      <TopBar title={title} back={back} actions={actions} root={root} />
      <div className={cls}>{children}</div>
    </>
  );
}
