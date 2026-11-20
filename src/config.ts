import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const addonName = 'docs';

const optionKeys = ['package', 'name', 'entry', 'tsconfig', 'examples'] as const;

type OptionKey = (typeof optionKeys)[number];

export type DocsOptions = Partial<Record<OptionKey, string>>;

export type DocsConfig = {
  // Directory of the documented package, relative to the root.
  package: string;
  // Library name in docs.json.
  name: string;
  // TypeScript entry point for the API reference.
  entry: string;
  // tsconfig for the API reference.
  tsconfig: string;
  // Directory of type-checked example fixtures, or empty when the project has none.
  examples: string;
};

type ProjectConfig = { addons?: Array<{ name: string; options?: Record<string, unknown> }> };

function isOptionKey(key: string): key is OptionKey {
  return (optionKeys as readonly string[]).includes(key);
}

function titleFromPackageName(name: string) {
  return (name.split('/').at(-1) ?? name)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Reads the docs addon options that `jfdevelops add addon docs` records in jfdevelops.json. */
function readAddonOptions(root: string): Record<string, unknown> {
  const file = path.join(root, 'jfdevelops.json');

  if (!existsSync(file)) {
    return {};
  }

  const config = JSON.parse(readFileSync(file, 'utf8')) as ProjectConfig;

  return config.addons?.find((entry) => entry.name === addonName)?.options ?? {};
}

/**
 * Resolves the docs settings for a project. Explicit overrides win over the addon options in
 * jfdevelops.json, which win over the defaults.
 */
export function loadConfig(root: string, overrides: DocsOptions = {}): DocsConfig {
  const options: DocsOptions = {};

  for (const [key, value] of Object.entries({ ...readAddonOptions(root), ...overrides })) {
    if (!isOptionKey(key)) {
      throw new Error(`Unknown docs option "${key}". Allowed: ${optionKeys.join(', ')}.`);
    }

    if (value !== undefined && value !== null && value !== '') {
      options[key] = String(value);
    }
  }

  const packageDirectory = options.package ?? '.';
  const manifestFile = path.join(root, packageDirectory, 'package.json');

  if (!existsSync(manifestFile)) {
    throw new Error(`The docs package "${packageDirectory}" has no package.json.`);
  }

  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { name?: string };
  const inPackage = (file: string) => path.posix.join(packageDirectory, file);

  return {
    package: packageDirectory,
    name: options.name ?? titleFromPackageName(manifest.name ?? path.basename(path.resolve(root, packageDirectory))),
    entry: options.entry ?? inPackage('src/index.ts'),
    tsconfig: options.tsconfig ?? inPackage('tsconfig.json'),
    examples: options.examples ?? '',
  };
}
