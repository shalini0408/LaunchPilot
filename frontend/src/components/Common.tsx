import type { ReactNode } from "react";
export function Heading({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="eyebrow">{tag}</div>
      <h1 className="heading">{title}</h1>
      <p className="sub">{children}</p>
    </>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function ExternalLink({
  href,
  children,
  className = "link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
