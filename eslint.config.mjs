import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

config.push({
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'react-hooks/immutability': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react/no-unescaped-entities': 'off',
  },
});

export default config;
