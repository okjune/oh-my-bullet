/**
 * Stand-in for the obsidian module in tests. It has only the values the tested
 * modules use at run time; everything else they import from obsidian is a type.
 */
export class Menu {}

export class TFile {
	path = '';
	extension = 'md';
}

export function normalizePath(path: string): string {
	return path;
}
