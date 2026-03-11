import js from "@eslint/js";
import htmlEslint from "@html-eslint/eslint-plugin";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";
import html from "eslint-plugin-html";

const baseJsRules = {
  ...js.configs.recommended.rules,
  "no-console": "off",
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
};

export default [
  {
    ignores: ["data/**", "assets/icons/**"],
  },
  {
    files: ["assets/modules/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: baseJsRules,
  },
  {
    files: ["assets/*.worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.worker,
      },
    },
    rules: baseJsRules,
  },
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: baseJsRules,
  },
  {
    files: ["proxy/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: baseJsRules,
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: baseJsRules,
  },
  {
    files: ["index.html"],
    ...htmlEslint.configs["flat/recommended"],
    rules: {
      ...htmlEslint.configs["flat/recommended"].rules,
      "@html-eslint/attrs-newline": "off",
      "@html-eslint/element-newline": "off",
      "@html-eslint/indent": "off",
      "@html-eslint/no-extra-spacing-attrs": "off",
      "@html-eslint/quotes": "off",
      "@html-eslint/use-baseline": "off",
    },
  },
  {
    files: ["index.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      "html/html-extensions": [".html"],
    },
    rules: baseJsRules,
  },
  eslintConfigPrettier,
];
