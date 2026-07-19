import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/exhaustive-deps":
        process.env.NODE_ENV === "production" ? "off" : "warn",
      "react-hooks/static-components": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react/no-unescaped-entities": "off",
      "react/no-children-prop": "off",
      "react/display-name": "off",
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
