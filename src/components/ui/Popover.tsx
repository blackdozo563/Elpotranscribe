import { useEffect, useRef, type ReactNode, type RefObject } from "react";
interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  anchorRef: RefObject<HTMLElement | null>;
}
export function Popover({ open, onClose, label, children, anchorRef }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchorRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      )
        onClose();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
      if (document.activeElement === document.body) previous?.focus();
    };
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="ui-popover"
    >
      {children}
    </div>
  );
}
