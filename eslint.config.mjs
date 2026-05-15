import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import unusedImports from 'eslint-plugin-unused-imports';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'data/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

config.push({
  plugins: {
    'unused-imports': unusedImports,
  },
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
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
    'react-hooks/immutability': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react/no-unescaped-entities': 'off',
  },
});

export default config;
