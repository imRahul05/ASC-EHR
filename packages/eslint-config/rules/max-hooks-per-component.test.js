import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import rule, { ADVICE } from "./max-hooks-per-component.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("max-hooks-per-component", rule, {
  valid: [
    // One object state instead of many scalars.
    `function Form() { const [form, setForm] = useState({ email: "", password: "", remember: false }); return <form />; }`,
    // Two states + one effect is within limits.
    `const Panel = () => { const [a] = useState(0); const [b] = React.useState(1); useEffect(() => {}, []); return null; };`,
    // Hooks inside nested callbacks count for the callback, not the component.
    `function List() { const [items] = useState([]); return items.map(() => null); }`,
    // Custom limits.
    { code: `function A() { useState(); useState(); useState(); }`, options: [{ useState: 3 }] },
    // Object.prototype names are not hooks (regression: `toString` was counted via `in`).
    `function ids() { a.toString(); b.toString(); c.toString(); d.valueOf(); e.valueOf(); }`,
  ],
  invalid: [
    {
      code: `function LoginForm() { const [email] = useState(""); const [password] = useState(""); const [errors] = useState({}); return null; }`,
      errors: [{ messageId: "tooMany", data: { name: "LoginForm", hook: "useState", count: "3", max: "2", advice: ADVICE.useState } }],
    },
    {
      code: `const Page = () => { useEffect(() => {}, []); React.useEffect(() => {}, []); return null; };`,
      errors: [{ messageId: "tooMany", data: { name: "Page", hook: "useEffect", count: "2", max: "1", advice: ADVICE.useEffect } }],
    },
    {
      code: `function useThing() { useRef(); useRef(); useRef(); }`,
      errors: [{ messageId: "tooMany", data: { name: "useThing", hook: "useRef", count: "3", max: "2", advice: ADVICE.useRef } }],
    },
  ],
});
