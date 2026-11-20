import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ADDON_NAME = 'docs';
const OPTION_KEYS = ['package', 'name', 'entry', 'tsconfig', 'examples'];

function readJson(file) {

  return JSON.parse(readFileSync(file, 'utf8'));
}

function titleFromPackageName(name) {

  return name
    .split('/')
    .pop()
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Reads the docs addon options that `jfdevelops add addon docs` records in jfdevelops.json. */
function readAddonOptions(root) {
  const file = path.join(root, 'jfdevelops.json');

  if (!existsSync(file)) {

    return {};
  }

  const addon = readJson(file).addons?.find((entry) => entry.name === ADDON_NAME);

  return addon?.options ?? {};
}

/**
 * Resolves the docs settings for a project. Explicit overrides win over the addon options in
 * jfdevelops.json, which win over the defaults.
 *
 * - package: directory of the documented package, relative to the root. Default `.`.
 * - name: library name shown in docs.json. Default: the package name, title-cased.
 * - entry: TypeScript entry point for the API reference. Default `<package>/src/index.ts`.
 * - tsconfig: tsconfig for the API reference. Default `<package>/tsconfig.json`.
 * - examples: directory of type-checked example fixtures, or empty when the project has none.
 */
export function loadConfig(root, overrides = {}) {
  const options = { ...readAddonOptions(root), ...overrides };

  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.includes(key)) {
      throw new Error(`Unknown docs option "${key}". Allowed: ${OPTION_KEYS.join(', ')}.`);
    }
  }

  const packageDirectory = String(options.package ?? '.');
  const manifestFile = path.join(root, packageDirectory, 'package.json');

  if (!existsSync(manifestFile)) {
    throw new Error(`The docs package "${packageDirectory}" has no package.json.`);
  }

  const manifest = readJson(manifestFile);
  const join = (file) => path.posix.join(packageDirectory, file);

  return {
    package: packageDirectory,
    name: String(options.name ?? titleFromPackageName(manifest.name)),
    entry: String(options.entry ?? join('src/index.ts')),
    tsconfig: String(options.tsconfig ?? join('tsconfig.json')),
    examples: options.examples ? String(options.examples) : '',
  };
}
