import type { ComponentPropsWithRef } from "react";
export function TextField({
  className = "",
  ...props
}: ComponentPropsWithRef<"input">) {
  return <input {...props} className={`ui-field ${className}`} />;
}
export function TextArea({
  className = "",
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea {...props} className={`ui-field ui-textarea ${className}`} />
  );
}
