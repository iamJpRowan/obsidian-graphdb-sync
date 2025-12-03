import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					args: "none",
					caughtErrors: "none",
					ignoreRestSiblings: true,
					vars: "all",
				},
			],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
	{
		ignores: [
			"main.js",
			"*.config.mjs",
			"version-bump.mjs",
			"node_modules/**",
			".obsidian/**",
			"build/**",
		],
	}
);

