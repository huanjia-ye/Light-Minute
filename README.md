# Light Meetily

Light Meetily is a resume-friendly MVP rebuilt from the mature Meetily product direction.
It keeps the core experience small and fast:

- home recording workspace
- streamed transcript panel
- meeting archive
- meeting detail page
- AI summary generation and editing
- audio import flow
- focused settings page

This version currently uses mock adapters so the full frontend workflow is already usable before a
real backend is connected.

## Stack

- Vite
- React
- TypeScript
- React Router
- Sass Modules
- Zustand
- TanStack Query
- TanStack Virtual
- Vitest + Testing Library

## Current MVP Features

### Recording workspace

- start, pause, resume, stop and save
- mock transcript streaming
- live transcript list with virtualization
- recent meetings panel

### Meeting archive

- list all saved meetings
- search by meeting title or summary text
- open meeting detail pages

### Meeting detail

- transcript timeline
- generate AI summary with mock OpenAI or Custom OpenAI behavior
- edit markdown summary
- save summary
- copy summary markdown

### Settings

- OpenAI / Custom OpenAI provider toggle
- model
- endpoint
- API key
- summary template
- microphone
- recordings path

### Persistence

- meeting records are stored in browser storage
- settings are persisted locally
- when browser local storage is blocked, the app falls back to in-memory storage

## Routing Notes

The app supports both:

- `http://` / `https://` dev or preview runs
- direct `file://` opening of the built app

It automatically switches to hash routing when opened from a local file, which avoids the blank-page
issue caused by standard browser history routing on file paths.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

The production output is written to `dist/`.

## Test

```bash
npm run lint
npm run test
npm run build
```

## Covered By Automated Tests

- router mode selection
- browser storage fallback
- mock recording engine
- meeting storage API
- home page recording flow
- home page import flow
- meetings page search and detail navigation
- meeting detail summary generation, save and copy
- settings save and reset

## Next Step For Real Backend

You can keep the current frontend and replace the mock adapters with:

- a real transcription stream over WebSocket or Tauri events
- a real meeting persistence API
- an OpenAI-compatible summary endpoint

The main integration seams are already isolated in:

- `src/features/recording/`
- `src/features/meetings/`
- `src/features/summary/`
- `src/features/settings/`
