import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-role-name-comparison.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });
const error = { messageId: "roleName" };

ruleTester.run("no-role-name-comparison", rule, {
  valid: [
    `if (can(principal, "note.sign", { facilityId })) {}`,
    // Not a role-like name on the other side.
    `if (status === "ADMIN") {}`,
    // Comparing two variables is not a role-name literal comparison.
    `if (item.role === role) {}`,
    `const same = attestation.role !== payload.role;`,
    // A role-like value compared with a non-role string.
    `if (user.role === "SYSTEM") {}`,
    `switch (kind) { case "ADMIN": break; }`,
    `["a", "b"].includes(role);`,
    `const t = { toString: 1 }; t.role;`,
  ],
  invalid: [
    { code: `if (user.role === "PATIENT") {}`, errors: [error] },
    { code: `if (role !== "NURSE") {}`, errors: [error] },
    { code: `if ("SURGEON" == user.role) {}`, errors: [error] },
    { code: `if (user?.role === "ADMIN") {}`, errors: [error] },
    { code: `if (membership.roleKey === "gi-physician") {}`, errors: [error] },
    { code: `switch (user.role) { case "SURGEON": break; default: break; }`, errors: [error] },
    { code: `["ADMIN", "NURSE"].includes(user.role);`, errors: [error] },
  ],
});

// TypeScript wrappers must not hide a comparison.
const tsRuleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
});

tsRuleTester.run("no-role-name-comparison (TypeScript)", rule, {
  valid: [`if (user.role === (kind as string)) {}`, `if ((status as string) === ("ADMIN" as const)) {}`],
  invalid: [
    { code: `if (user.role === ("ADMIN" as const)) {}`, errors: [error] },
    { code: `if (user.role === <string>"NURSE") {}`, errors: [error] },
    { code: `if (user.role === ("rn" satisfies string)) {}`, errors: [error] },
    { code: `if ((user as Member).role !== "PATIENT") {}`, errors: [error] },
    { code: `if (role! === "ADMIN") {}`, errors: [error] },
    { code: `if ((user.role as string) === "SURGEON") {}`, errors: [error] },
    { code: `switch (role as string) { case "ADMIN": break; default: break; }`, errors: [error] },
    { code: `(["ADMIN", "NURSE"] as const).includes(user.role);`, errors: [error] },
  ],
});
