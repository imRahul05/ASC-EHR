/**
 * asc/no-role-name-comparison — code checks capabilities (`can(principal, cap)`),
 * never role names (docs/product/08-identity-access-and-tenancy.md §7, P05).
 * Role names live in @asc/authz templates and the audit trail only.
 *
 * Flags a role-like value (an identifier or property whose name contains
 * "role") compared with a known role name literal, switched on, or tested
 * with `["ADMIN", ...].includes(role)`.
 */

/** Legacy `UserRole` values plus the D-A7 role keys. */
export const ROLE_NAMES = new Set([
  "SURGEON",
  "ANESTHESIOLOGIST",
  "NURSE",
  "ADMIN",
  "PATIENT",
  "front-desk",
  "rn",
  "tech",
  "gi-physician",
  "anesthesia",
  "coder",
  "admin",
  "auditor",
  "patient",
]);

const COMPARISON_OPERATORS = new Set(["==", "===", "!=", "!=="]);

/** @param {import("estree").Node | null | undefined} node */
function isRoleName(node) {
  return node?.type === "Literal" && typeof node.value === "string" && ROLE_NAMES.has(node.value);
}

/** @param {import("estree").Node | null | undefined} node */
function isRoleLike(node) {
  if (node?.type === "ChainExpression") return isRoleLike(node.expression);
  if (node?.type === "Identifier") return /role/i.test(node.name);
  if (node?.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return /role/i.test(node.property.name);
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow comparing role names; check capabilities with can()" },
    schema: [],
    messages: {
      roleName: "Don't branch on role names. Check a capability: can(principal, capability, { facilityId }).",
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;
        if ((isRoleLike(node.left) && isRoleName(node.right)) || (isRoleName(node.left) && isRoleLike(node.right))) {
          context.report({ node, messageId: "roleName" });
        }
      },
      SwitchStatement(node) {
        if (isRoleLike(node.discriminant) && node.cases.some((switchCase) => isRoleName(switchCase.test))) {
          context.report({ node, messageId: "roleName" });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "includes" &&
          callee.object.type === "ArrayExpression" &&
          callee.object.elements.some((element) => isRoleName(element)) &&
          isRoleLike(node.arguments[0])
        ) {
          context.report({ node, messageId: "roleName" });
        }
      },
    };
  },
};
