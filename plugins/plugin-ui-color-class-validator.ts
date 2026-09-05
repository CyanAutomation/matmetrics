import ts from 'typescript';

export interface PluginColorClassException {
  file: string;
  token: string;
  reason: string;
}

export interface PluginColorClassDiagnostic {
  file: string;
  line: number;
  token: string;
  replacement: string;
}

interface ValidateOptions {
  allowedTokens: ReadonlySet<string>;
  exceptions?: readonly PluginColorClassException[];
  helperNames?: ReadonlySet<string>;
}

const colorUtility =
  /^(?:[\w-]+:)*(text|bg|border)-(red|green|blue|amber|yellow|purple|pink|indigo|destructive|primary|secondary|accent|muted|foreground)(?:-(?:foreground|\d{2,3}))?(?:\/\d{1,3})?$/;
const defaultHelpers = new Set(['cn', 'clsx', 'classNames', 'twMerge', 'cva']);

function replacementFor(token: string, utility: string): string {
  const variants = token.slice(0, token.lastIndexOf(utility));
  if (utility === 'text') return `${variants}text-destructive`;
  if (utility === 'border') return `${variants}border-destructive/30`;
  return `${variants}bg-destructive/10`;
}

/** Validates only strings that can contribute to a JSX className. */
export function validatePluginColorClasses(
  source: string,
  file: string,
  options: ValidateOptions
): PluginColorClassDiagnostic[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const helpers = options.helperNames ?? defaultHelpers;
  const exceptions = options.exceptions ?? [];
  const diagnostics: PluginColorClassDiagnostic[] = [];

  const inspectText = (value: string, start: number): void => {
    for (const match of value.matchAll(/\S+/g)) {
      const token = match[0];
      const matchIndex = match.index ?? 0;
      const color = token.match(colorUtility);
      if (!color || options.allowedTokens.has(token)) continue;
      if (
        exceptions.some((item) => item.file === file && item.token === token)
      ) {
        continue;
      }
      const position = sourceFile.getLineAndCharacterOfPosition(
        start + matchIndex
      );
      diagnostics.push({
        file,
        line: position.line + 1,
        token,
        replacement: replacementFor(token, color[1]),
      });
    }
  };

  const inspectExpression = (node: ts.Expression): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      inspectText(node.text, node.getStart(sourceFile) + 1);
    } else if (ts.isTemplateExpression(node)) {
      inspectText(node.head.text, node.head.getStart(sourceFile) + 1);
      for (const span of node.templateSpans) {
        inspectExpression(span.expression);
        inspectText(span.literal.text, span.literal.getStart(sourceFile) + 1);
      }
    } else if (ts.isConditionalExpression(node)) {
      inspectExpression(node.whenTrue);
      inspectExpression(node.whenFalse);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      inspectExpression(node.left);
      inspectExpression(node.right);
    } else if (ts.isParenthesizedExpression(node)) {
      inspectExpression(node.expression);
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element) => {
        if (ts.isExpression(element)) inspectExpression(element);
      });
    } else if (ts.isObjectLiteralExpression(node)) {
      node.properties.forEach((property) => {
        if (ts.isPropertyAssignment(property)) {
          if (
            ts.isStringLiteral(property.name) ||
            ts.isNumericLiteral(property.name) ||
            ts.isNoSubstitutionTemplateLiteral(property.name)
          ) {
            inspectExpression(property.name);
          } else if (ts.isComputedPropertyName(property.name)) {
            // Try to evaluate simple string-concatenation expressions
            const tryEvalToString = (expr: ts.Expression): string | null => {
              if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
                return expr.text;
              }
              if (ts.isParenthesizedExpression(expr)) return tryEvalToString(expr.expression);
              if (
                ts.isBinaryExpression(expr) &&
                expr.operatorToken.kind === ts.SyntaxKind.PlusToken
              ) {
                const left = tryEvalToString(expr.left as ts.Expression);
                const right = tryEvalToString(expr.right as ts.Expression);
                if (left !== null && right !== null) return left + right;
                return null;
              }
              return null;
            };

            const evaluated = tryEvalToString(property.name.expression);
            if (evaluated !== null) {
              inspectText(evaluated, property.name.expression.getStart(sourceFile) + 1);
            } else {
              inspectExpression(property.name.expression);
            }
          }
          inspectExpression(property.initializer);
        }
      });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      helpers.has(node.expression.text)
    ) {
      node.arguments.forEach(inspectExpression);
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sourceFile) === 'className' &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        inspectText(
          node.initializer.text,
          node.initializer.getStart(sourceFile) + 1
        );
      } else if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression
      ) {
        inspectExpression(node.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return diagnostics;
}
