import "react";

// CSS custom properties in a style object, such as the theme tokens a preview sets (ATS-54), so
// they type-check without a cast. Only names that start with -- are allowed.
declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | undefined;
  }
}
