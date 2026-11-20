# @jfdevelops/docs

Generate and check versioned library docs. Pages are plain Markdown under `docs/framework/<framework>/v<major>/`. This package writes everything else: `docs/docs.json`, a `meta.json` in every directory, and a TypeDoc API reference for the current major.

## Set up

In a project managed by `@jfdevelops/cli`, add the docs addon:

```sh
npx jfdevelops add addon docs
```

That installs this package, records its options in `jfdevelops.json`, adds the `docs:generate` and `docs:check` scripts, ignores the generated files, and adds a docs workflow that runs only when the docs or the documented package change.

To use it without the CLI, install it and pass the options as flags:

```sh
pnpm add --save-dev @jfdevelops/docs
pnpm exec jfdevelops-docs generate --package packages/core --name "React Layout"
pnpm exec jfdevelops-docs check --package packages/core
```

## Commands

| Command | Does |
| --- | --- |
| `jfdevelops-docs generate` | Writes the API reference for the current major, `docs/docs.json` and every `meta.json`. `--skip-reference` writes navigation only. |
| `jfdevelops-docs check` | Validates frontmatter, layout, Markdown, links, anchors, install commands, page order and example fixtures. Exits 1 on any problem. |

`--root <dir>` runs against another directory. It defaults to the current one.

## Options

Options are read from the `docs` addon in `jfdevelops.json`. A flag with the same name overrides them.

```json
{
  "addons": [
    {
      "name": "docs",
      "options": { "package": "packages/core", "name": "React Layout" }
    }
  ]
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `package` | `.` | Directory of the documented package. Its `package.json` sets the current major, and its `CHANGELOG.md` sets the last release of each earlier major. |
| `name` | The package name, title-cased | Library name in `docs.json`. |
| `entry` | `<package>/src/index.ts` | Entry point for the API reference. |
| `tsconfig` | `<package>/tsconfig.json` | tsconfig for the API reference. |
| `examples` | none | Directory of type-checked fixtures that `example=<path>` fences must match. |

## Generated files

None of these are committed:

- `docs/docs.json`, the manifest a docs site reads (`schemaVersion: 2`)
- `meta.json` in each docs directory, with the page order from frontmatter `order`
- `docs/framework/<framework>/v<current>/reference/`, which carries its own `.gitignore`

## Docs layout

```text
docs/
  README.md                  the only file at the root
  framework/<framework>/
    v<major>/                one directory per documented major
      overview.md
      guides/*.md
      reference/             generated for the current major
      assets/*               images only
  maintainers/               never public
```

Version status comes from the package major: that major is `current`, earlier ones are `previous`, `v0` is `legacy`, and later ones are `next`. Install commands in earlier majors must pin exact versions, with the documented package at that major's last release.

Each install command is written once per package manager, in consecutive fences labeled `npm`, `pnpm`, `yarn` and `bun`:

````markdown
```npm
npm i @acme/widgets
```

```pnpm
pnpm add @acme/widgets
```

```yarn
yarn add @acme/widgets
```

```bun
bun add @acme/widgets
```
````

The check validates versions in all four, and rejects install commands in an `sh` or `bash` fence. A docs site can render the four fences as tabs.

Writing guidance lives in the `jf-docs` skill from `@jfdevelops/skills`.

## Development

Requires Node.js 22.12.0 or newer and pnpm 10.28.1.

```sh
pnpm install --frozen-lockfile
pnpm check
```
