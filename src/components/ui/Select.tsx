import {
  Children,
  isValidElement,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? text(child.props.children)
        : String(child),
    )
    .join("");
export function Select({
  children,
  className = "",
  onChange,
  title,
  ...props
}: ComponentPropsWithRef<"select">) {
  const [selected, setSelected] = useState(props.defaultValue);
  const value = props.value ?? selected;
  const options = Children.toArray(children).filter(
    isValidElement<{ value?: string | number; children?: ReactNode }>,
  );
  const label =
    options.find((option) => String(option.props.value) === String(value)) ??
    options[0];
  return (
    <span className="ui-select">
      <select
        {...props}
        title={title ?? text(label?.props.children)}
        className={`ui-field ${className}`}
        onChange={(event) => {
          setSelected(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={13} />
    </span>
  );
}
