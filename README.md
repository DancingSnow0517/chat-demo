# chat

English | [简体中文](README.zh-CN.md)

A chat app powered by the DeepSeek API. This fork moves authentication, conversation storage, and attachment originals to Cloudflare Workers + D1 + R2, so the browser no longer holds an API key and any device can sign in and pick up where it left off.

You can [try the app online](https://chat.dancingsnow.xyz).

## Getting started

Install Node.js 22.12+ and pnpm, then run:

```sh
git clone https://github.com/DancingSnow0517/chat.git
cd chat
pnpm install
pnpm dev
```

The dev server proxies `/api` to a local Worker (`http://localhost:8787`). Start the Worker in another terminal:

```sh
cd worker
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to GitHub Pages or any static host.

## Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.
- GitHub OAuth sign-in with cloud-synced conversations and attachments.

## Data and storage

- Conversations, attachment originals, and import staging live in Cloudflare D1 / R2.
- Device preferences (language, theme, location, TTS voice, thinking/search toggles) stay in the browser's localStorage.
- The DeepSeek API key is stored only as a Cloudflare Worker Secret and never reaches the browser.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all cloud conversations and attachments. Exports include conversations and locally available original images. See the [history import/export documentation](src/services/chat/history/README.md) for the archive format and preservation details.

## Development

| Command       | Description                  |
| ------------- | ---------------------------- |
| `pnpm dev`    | Start the development server |
| `pnpm build`  | Build into `dist/`           |
| `pnpm type`   | Run TypeScript type checks   |
| `pnpm lint`   | Lint with oxlint             |
| `pnpm format` | Format with oxfmt            |

```text
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, cloud storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities
worker/                Cloudflare Worker (auth, LLM proxy, D1/R2 storage)
```

## Syncing with upstream

This branch keeps the upstream directory structure intact. Changes are concentrated in:

- `src/services/api/client.ts` / `speech.ts`: remove the `apiKey` parameter and use same-origin relative paths.
- `src/services/chat/db.ts`: replace the IndexedDB implementation with fetch calls while keeping the same function signatures.
- `src/services/chat/drafts.ts` / `attachments.ts` / `store.ts`: remove `apiKey` plumbing.
- `src/components/settings/`: replace the API key section with an account/sign-out section; add `Login.tsx`.
- `src/services/settings.ts`: remove the `apiKey` field.
- `src/i18n/zh.ts` / `en.ts`: replace API-key copy with login/logout copy.

Pull upstream updates:

```sh
git fetch upstream
git merge upstream/main
# Conflicts concentrate in the files above; run pnpm type && pnpm lint after resolving
```

The Worker lives in `worker/` and deploys independently; see [worker/wrangler.toml](worker/wrangler.toml).

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
