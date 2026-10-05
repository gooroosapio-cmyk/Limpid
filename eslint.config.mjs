import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...next,
  ...ts,
  { ignores: [".next/**", "node_modules/**", "public/sw.js", "next-env.d.ts"] },
  {
    rules: {
      // Convention du dépôt : un nom préfixé par « _ » est volontairement ignoré.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // Règles pensées pour le React Compiler (non utilisé ici) : signalées sans bloquer.
      // Le lecteur mesure le DOM au rendu (refs) et relit sessionStorage au montage.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default config;
