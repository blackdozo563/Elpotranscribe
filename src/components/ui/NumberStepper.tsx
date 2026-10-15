import { useEffect, useState, type CSSProperties } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "./Button";
interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  "aria-label": string;
  disabled?: boolean;
}
export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  disabled,
  "aria-label": label,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const change = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next));
    setDraft(String(bounded));
    onValueChange(bounded);
  };
  return (
    <span
      className="ui-number-stepper"
      style={
        {
          "--stepper-ch": Math.max(String(max).length, String(value).length, 2),
        } as CSSProperties
      }
    >
      <input
        className="ui-field"
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next) && next >= min && next <= max)
            onValueChange(next);
        }}
        onBlur={() => {
          const next = Number(draft);
          if (!draft.trim() || !Number.isFinite(next)) setDraft(String(value));
          else change(next);
        }}
      />
      <span>
        <Button
          variant="quiet"
          disabled={disabled || value >= max}
          aria-label={`Augmenter ${label}`}
          onClick={() => change(value + step)}
        >
          <ChevronUp size={10} />
        </Button>
        <Button
          variant="quiet"
          disabled={disabled || value <= min}
          aria-label={`Diminuer ${label}`}
          onClick={() => change(value - step)}
        >
          <ChevronDown size={10} />
        </Button>
      </span>
    </span>
  );
}
