import type { ComponentPropsWithRef } from "react";
type Props = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "quiet" | "destructive";
  size?: "regular" | "large";
};
export function Button({
  variant,
  size = "regular",
  className = "",
  type = "button",
  ...props
}: Props) {
  const style =
    variant ??
    (className.split(/\s+/).includes("primary") ? "primary" : "secondary");
  return (
    <button
      {...props}
      type={type}
      className={`ui-button ui-button-${style} ui-button-${size} ${className}`}
    />
  );
}
