/**
 * asc/max-hooks-per-component — keeps React components and custom hooks from
 * sprawling into many useState/useEffect/useRef calls (see
 * docs/agent/ui-guidelines.md §3a and LEARNING_MISTAKES.md LM-003).
 *
 * Counts direct hook calls per function (nested callbacks are their own scope)
 * and reports the function when a hook exceeds its limit.
 */

/** @type {Record<string, number>} */
const DEFAULT_LIMITS = {
  useState: 2,
  useEffect: 1,
  useLayoutEffect: 1,
  useRef: 2,
};

/** @type {Record<string, string>} */
export const ADVICE = {
  useState:
    "Group related values into one object state (useState<T>) or useReducer, keep form fields in react-hook-form, and derive values during render instead of storing them.",
  useEffect:
    "Derive values during render, run logic in event handlers, and fetch with TanStack Query / Medplum hooks. Effects are only for syncing with an external system.",
  useLayoutEffect: "Only for measuring layout before paint; one per component.",
  useRef: "Use refs only for DOM nodes or imperative handles; keep data in state, props or the query cache.",
};

/** @param {import("estree").Node & { parent?: import("estree").Node }} node */
function functionName(node) {
  if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") && node.id) return node.id.name;
  const parent = node.parent;
  if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") return parent.id.name;
  return "This function";
}

/** @param {import("estree").CallExpression["callee"]} callee */
function hookName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Limit useState/useEffect/useLayoutEffect/useRef calls per component or hook",
    },
    schema: [
      {
        type: "object",
        additionalProperties: { type: "integer", minimum: 0 },
      },
    ],
    messages: {
      tooMany: "{{name}} calls {{hook}} {{count}} times (max {{max}}). {{advice}}",
    },
  },
  create(context) {
    /** @type {Record<string, number>} */
    const limits = { ...DEFAULT_LIMITS, ...(context.options[0] ?? {}) };
    /** @type {{ node: import("estree").Node, counts: Record<string, number> }[]} */
    const stack = [];

    /** @param {import("estree").Node} node */
    const enter = (node) => {
      stack.push({ node, counts: {} });
    };

    /** @param {import("estree").Node} node */
    const exit = (node) => {
      const frame = stack.pop();
      if (!frame) return;
      for (const [hook, count] of Object.entries(frame.counts)) {
        const max = limits[hook];
        if (max === undefined || count <= max) continue;
        context.report({
          node,
          messageId: "tooMany",
          data: { name: functionName(node), hook, count: String(count), max: String(max), advice: ADVICE[hook] ?? "" },
        });
      }
    };

    return {
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": exit,
      FunctionExpression: enter,
      "FunctionExpression:exit": exit,
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": exit,
      CallExpression(node) {
        const name = hookName(node.callee);
        const frame = stack[stack.length - 1];
        if (!name || !frame || !(name in limits)) return;
        frame.counts[name] = (frame.counts[name] ?? 0) + 1;
      },
    };
  },
};
