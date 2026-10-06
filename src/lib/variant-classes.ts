type VariantDefinitions = Record<string, Record<string, string>>;

export type VariantSelection<Definitions extends VariantDefinitions> = {
  [Name in keyof Definitions]?: keyof Definitions[Name] | null;
};

export type VariantProps<Builder> = Builder extends (
  selection?: infer Selection
) => string
  ? NonNullable<Selection>
  : never;

export function createVariantClasses<
  const Definitions extends VariantDefinitions,
>(
  base: string,
  definitions: Definitions,
  defaultVariants: VariantSelection<Definitions> = {}
): (selection?: VariantSelection<Definitions>) => string {
  return (selection = {}) => {
    const classes = [base];
    const names = Object.keys(definitions) as Array<keyof Definitions>;

    for (const name of names) {
      const requested = selection[name];
      const selected =
        requested === undefined ? defaultVariants[name] : requested;
      if (selected == null) continue;

      const variantClasses = definitions[name] as Record<string, string>;
      const className = variantClasses[String(selected)];
      if (className) classes.push(className);
    }

    return classes.filter(Boolean).join(' ');
  };
}
