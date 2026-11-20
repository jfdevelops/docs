#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkDocs } from './check.js';
import { loadConfig, type DocsConfig, type DocsOptions } from './config.js';
import { generateDocs } from './generate.js';

const usage = `Usage: jfdevelops-docs <command> [options]

Commands:
  generate   Write the API reference, docs/docs.json and every meta.json
  check      Validate every page, link and install command

Options:
  --root <dir>         Project root (default: the current directory)
  --package <dir>      Documented package directory
  --name <name>        Library name shown in docs.json
  --entry <file>       TypeScript entry point for the API reference
  --tsconfig <file>    tsconfig for the API reference
  --examples <dir>     Directory of type-checked example fixtures
  --skip-reference     generate: write navigation only
  -h, --help           Show this help

Options default to the "docs" addon in jfdevelops.json.`;

function readOverrides(values: DocsOptions) {
  const overrides: DocsOptions = {};

  for (const key of ['package', 'name', 'entry', 'tsconfig', 'examples'] as const) {
    const value = values[key];

    if (value !== undefined) {
      overrides[key] = value;
    }
  }

  return overrides;
}

function runCheck(root: string, config: DocsConfig) {
  const { errors, stats } = checkDocs({ root, config });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`${error.file}: [${error.code}] ${error.message}`);
    }

    console.error(`\nDocs check failed with ${errors.length} problem${errors.length === 1 ? '' : 's'}.`);

    return 1;
  }

  console.log(
    `Docs check passed: ${stats.versions} versions, ${stats.pages} pages, ${stats.links} links, ${stats.examples} embedded examples.`,
  );

  return 0;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      package: { type: 'string' },
      name: { type: 'string' },
      entry: { type: 'string' },
      tsconfig: { type: 'string' },
      examples: { type: 'string' },
      'skip-reference': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command] = positionals;

  if (values.help || !command) {
    console.log(usage);

    return values.help ? 0 : 1;
  }

  const root = path.resolve(values.root ?? process.cwd());
  const config = loadConfig(root, readOverrides(values));

  switch (command) {
    case 'generate':
      await generateDocs({ root, config, isReferenceSkipped: values['skip-reference'] ?? false });

      return 0;
    case 'check':
      return runCheck(root, config);
    default:
      console.error(`Unknown command "${command}".\n\n${usage}`);

      return 1;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
