import type { ComponentPropsWithoutRef } from "react";
export function StatusPill({
  status,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"span"> & { status?: string }) {
  return <span {...props} className={`status ${status ?? ""} ${className}`} />;
}
