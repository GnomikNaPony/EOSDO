import type { JSX } from "solid-js";
import { icon } from "../icons";
export function Icon(p: { name: string }) {
  return <span class="inline-flex" innerHTML={icon(p.name)} />;
}
export function Button(p: {
  children?: JSX.Element;
  onClick?: () => void;
  icon?: string;
  primary?: boolean;
  type?: "submit" | "button";
  disabled?: boolean;
}) {
  return (
    <button
      class={`button ${p.primary ? "primary" : ""}`}
      type={p.type || "button"}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      {p.icon && <Icon name={p.icon} />} {p.children}
    </button>
  );
}
