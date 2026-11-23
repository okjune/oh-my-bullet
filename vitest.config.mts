import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// The obsidian package has type definitions only; its code lives in the app.
		// Tests get a stand-in with the few values the tested modules use.
		alias: { obsidian: `${import.meta.dirname}/tests/obsidian-stub.ts` },
	},
	test: {
		include: ['tests/**/*.test.ts'],
	},
});
