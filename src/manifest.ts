import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, type DocsConfig } from './config.js';

/**
 * Builds docs/docs.json and every meta.json from the docs tree. Both are generated and gitignored;
 * page frontmatter is the source of truth.
 */
export const manifestSchemaVersion = 2;
export const versionId = /^v(\d+)$/;
export const generatedReference = 'reference';

export type VersionStatus = 'current' | 'previous' | 'legacy' | 'next';

export type Frontmatter =
  | { data: Record<string, string>; body: string; bodyOffset: number; error?: undefined }
  | { data: null; body: string; error: string };

export type CorePackage = { name: string; version: string; major: number; repository: string | undefined };

export type VersionDirectory = {
  id: string;
  major: number;
  status: VersionStatus;
  // Path relative to docs/.
  path: string;
  full: string;
  endpointVersion: string | null;
  // Absolute path of the generated API reference; only the current major has one.
  generatedReference: string | null;
};

export type FrameworkDirectory = { id: string; title: string; path: string; full: string; versions: VersionDirectory[] };

export type NavigationEntry =
  | { page: string; title: string }
  | { title: string; path: string; pages: NavigationEntry[] }
  | { title: string; path: string; generated: true };

export type MetaFile = { title?: string; pages: string[] };

export type DocsManifest = {
  schemaVersion: number;
  generatedBy: string;
  library: { id: string; name: string; npmPackage: string; repository: string | undefined };
  frameworks: Array<{
    id: string;
    title: string;
    path: string;
    defaultVersion: string | null;
    versions: Array<{
      id: string;
      label: string;
      major: number;
      status: VersionStatus;
      path: string;
      package: { name: string; endpointVersion: string | null };
      navigation: NavigationEntry[];
    }>;
  }>;
};

type BuildContext = { title: string; metaFiles: Map<string, MetaFile>; generatedReference: string | null; skipMeta: Set<string> };

/** Parses the `---` frontmatter block. Values are plain scalars. */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    return { data: null, body: normalized, error: 'The page must start with a frontmatter block.' };
  }

  const end = normalized.indexOf('\n---', 4);

  if (end === -1) {
    return { data: null, body: normalized, error: 'The frontmatter block is not closed.' };
  }

  const data: Record<string, string> = {};

  for (const line of normalized.slice(4, end).split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    const colon = line.indexOf(':');

    if (colon === -1) {
      return { data: null, body: normalized, error: `Frontmatter line "${line}" is not "key: value".` };
    }

    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();

    if (/^(".*"|'.*')$/.test(value)) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  const after = normalized.indexOf('\n', end + 1);
  const bodyOffset = after === -1 ? normalized.length : after + 1;

  return { data, body: after === -1 ? '' : normalized.slice(after + 1), bodyOffset };
}

function toPosix(value: string) {
  return value.split(path.sep).join('/');
}

function titleFromName(name: string) {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Highest released version of each major, read from the documented package's changelog. */
export function readReleasedVersions(root: string, config: DocsConfig = loadConfig(root)) {
  const changelog = path.join(root, config.package, 'CHANGELOG.md');
  const latest = new Map<number, number[]>();

  if (!existsSync(changelog)) {
    return new Map<number, string>();
  }

  for (const match of readFileSync(changelog, 'utf8').matchAll(/^## (\d+)\.(\d+)\.(\d+)\s*$/gm)) {
    const parts = match.slice(1, 4).map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;
    const known = latest.get(major);

    if (!known || minor > (known[1] ?? 0) || (minor === known[1] && patch > (known[2] ?? 0))) {
      latest.set(major, parts);
    }
  }

  return new Map([...latest].map(([major, parts]) => [major, parts.join('.')]));
}

export function versionStatus(major: number, currentMajor: number): VersionStatus {
  if (major === currentMajor) {
    return 'current';
  }

  if (major > currentMajor) {
    return 'next';
  }

  return major === 0 ? 'legacy' : 'previous';
}

function readPage(full: string) {
  const parsed = parseFrontmatter(readFileSync(full, 'utf8'));
  const order = Number(parsed.data?.['order']);

  return { title: parsed.data?.['title'] ?? null, order: Number.isInteger(order) ? order : Number.POSITIVE_INFINITY };
}

/**
 * Walks one directory of a version. Pages come first by frontmatter `order` (then name);
 * subdirectories follow by name.
 */
function buildDirectory(directory: string, base: string, context: BuildContext): NavigationEntry[] {
  const relative = toPosix(path.relative(base, directory));
  const entries = readdirSync(directory, { withFileTypes: true });
  const pages = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => {
      const name = entry.name.slice(0, -3);
      const page = readPage(path.join(directory, entry.name));

      return { name, page: relative === '' ? name : `${relative}/${name}`, title: page.title ?? titleFromName(name), order: page.order };
    })
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'en'));
  const directories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'assets')
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const navigation: NavigationEntry[] = pages.map(({ page, title }) => ({ page, title }));

  for (const name of directories) {
    const full = path.join(directory, name);
    const title = titleFromName(name);
    const childPath = relative === '' ? name : `${relative}/${name}`;

    if (context.generatedReference === full) {
      navigation.push({ title, path: childPath, generated: true });
    } else {
      navigation.push({ title, path: childPath, pages: buildDirectory(full, base, context) });
    }
  }

  if (!context.skipMeta.has(directory)) {
    context.metaFiles.set(toPosix(path.join(directory, 'meta.json')), {
      title: relative === '' ? context.title : titleFromName(path.basename(directory)),
      pages: [...pages.map(({ name }) => name), ...directories],
    });
  }

  return navigation;
}

export function readCorePackage(root: string, config: DocsConfig = loadConfig(root)): CorePackage {
  const manifest = JSON.parse(readFileSync(path.join(root, config.package, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    repository?: string | { url?: string };
  };
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;

  return {
    name: manifest.name,
    version: manifest.version,
    major: Number(manifest.version.split('.')[0]),
    repository: repository?.replace(/^git\+/, '').replace(/\.git$/, ''),
  };
}

/** Lists every framework and version directory with its derived facts. */
export function listVersions(root: string, config: DocsConfig = loadConfig(root)) {
  const docsRoot = path.join(root, 'docs');
  const frameworkRoot = path.join(docsRoot, 'framework');
  const core = readCorePackage(root, config);
  const released = readReleasedVersions(root, config);
  const frameworks: FrameworkDirectory[] = [];

  if (!existsSync(frameworkRoot)) {
    return { core, frameworks };
  }

  for (const entry of readdirSync(frameworkRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directory = path.join(frameworkRoot, entry.name);
    const versions = readdirSync(directory, { withFileTypes: true })
      .filter((child) => child.isDirectory() && versionId.test(child.name))
      .map((child): VersionDirectory => {
        const major = Number(versionId.exec(child.name)?.[1]);
        const full = path.join(directory, child.name);
        const isCurrent = major === core.major;

        return {
          id: child.name,
          major,
          status: versionStatus(major, core.major),
          path: toPosix(path.relative(docsRoot, full)),
          full,
          endpointVersion: isCurrent ? core.version : (released.get(major) ?? null),
          generatedReference: isCurrent ? path.join(full, generatedReference) : null,
        };
      })
      .sort((left, right) => right.major - left.major);

    frameworks.push({ id: entry.name, title: titleFromName(entry.name), path: toPosix(path.relative(docsRoot, directory)), full: directory, versions });
  }

  frameworks.sort((left, right) => left.id.localeCompare(right.id, 'en'));

  return { core, frameworks };
}

/** Builds docs.json and the meta.json files in memory. */
export function buildDocsNavigation({ root, config = loadConfig(root) }: { root: string; config?: DocsConfig }) {
  const docsRoot = path.join(root, 'docs');
  const { core, frameworks } = listVersions(root, config);
  const metaFiles = new Map<string, MetaFile>();

  metaFiles.set(toPosix(path.join(docsRoot, 'meta.json')), { pages: ['framework'] });
  metaFiles.set(toPosix(path.join(docsRoot, 'framework', 'meta.json')), { title: 'Frameworks', pages: frameworks.map((framework) => framework.id) });

  const manifest: DocsManifest = {
    schemaVersion: manifestSchemaVersion,
    generatedBy: 'jfdevelops-docs generate',
    library: { id: core.name.split('/').at(-1) ?? core.name, name: config.name, npmPackage: core.name, repository: core.repository },
    frameworks: frameworks.map((framework) => {
      metaFiles.set(toPosix(path.join(framework.full, 'meta.json')), { title: framework.title, pages: framework.versions.map((version) => version.id) });

      const current =
        framework.versions.find((version) => version.status === 'current') ?? framework.versions.find((version) => version.status !== 'next');

      return {
        id: framework.id,
        title: framework.title,
        path: framework.path,
        defaultVersion: current?.id ?? null,
        versions: framework.versions.map((version) => ({
          id: version.id,
          label: version.id,
          major: version.major,
          status: version.status,
          path: version.path,
          package: { name: core.name, endpointVersion: version.endpointVersion },
          navigation: buildDirectory(version.full, version.full, {
            title: version.id,
            metaFiles,
            generatedReference: version.generatedReference,
            skipMeta: new Set(version.generatedReference ? [version.generatedReference] : []),
          }),
        })),
      };
    }),
  };

  return { manifest, metaFiles };
}

/** Writes docs.json and every meta.json. */
export function writeDocsNavigation({ root, config = loadConfig(root) }: { root: string; config?: DocsConfig }) {
  const result = buildDocsNavigation({ root, config });

  writeFileSync(path.join(root, 'docs', 'docs.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);

  for (const [file, content] of result.metaFiles) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
  }

  return result;
}
