// Per-property brand color injection for the public guest flow.
//
// The operator picks one hex value (Property.primaryColor); we derive a
// 5-step palette from it via CSS color-mix() — no server-side palette
// computation needed. The vars are scoped to the wrapper element via a
// data attribute so multiple properties on the same page (rare) don't
// collide.
//
// When the operator hasn't picked a color, we fall back to a warm
// forest-green that fits the platform's "Field Office" baseline.

const FALLBACK = "#3b5a3b";

type Props = {
  /** Hex like "#2d5a3d"; null falls back to the platform default. */
  primaryColor: string | null;
  /** Stable id used as the scoping selector — pass the property id. */
  scope: string;
};

export function BrandStyle({ primaryColor, scope }: Props) {
  const color =
    primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)
      ? primaryColor
      : FALLBACK;
  const css = `[data-brand-scope="${scope}"] {
  --brand: ${color};
  --brand-fg: white;
  --brand-50: color-mix(in oklab, ${color} 6%, #fdfcf8);
  --brand-100: color-mix(in oklab, ${color} 12%, #fdfcf8);
  --brand-200: color-mix(in oklab, ${color} 22%, #fdfcf8);
  --brand-700: color-mix(in oklab, ${color} 85%, black);
  --brand-900: color-mix(in oklab, ${color} 70%, black);
}`;
  // dangerouslySetInnerHTML lets us emit the styles inline without
  // hydration mismatches; the contents are derived only from a regex-
  // validated hex value, so injection isn't a concern.
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
