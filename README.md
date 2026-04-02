# Light-Minute

Light-Minute is a meeting capture and summarization workspace built around a simple flow:

`record -> transcript -> summary -> archive`

It works out of the box in a zero-config mode, with optional local transcription and API-based enhancements.

## Quick Start

### Requirements

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

Open the local Vite URL shown in the terminal. This is the recommended first run for understanding the product quickly.

## What It Is

Light-Minute is a browser-based meeting notes application for capturing speech, reviewing transcripts, and turning them into structured summaries.

- live recording workspace
- audio import flow
- meeting archive
- meeting detail workspace
- summary generation and editing
- settings for optional integrations

## Current Capabilities

- record, pause, resume, stop, and save meetings
- stream transcript segments into the session view
- import audio and create meeting records
- review transcript and summary side by side
- generate summaries into a streaming editor
- recover local summary drafts after refresh
- persist meetings and settings in browser storage
- fall back gracefully when persistent storage is unavailable

## Running Modes

### Default Mode

- start with `npm run dev`
- no extra local services required
- import and summary flows can use demo fallback when real services are not configured

### Optional Local Transcription Mode

- start with `npm run dev:local`
- use only when the required local transcription files already exist in `runtime/`
- can use local Whisper and Parakeet services for stronger transcription workflows
- this is optional enhancement, not the default requirement

## Optional Configuration

### Summary API

Configure these settings if you want real summary generation instead of the demo summarizer:

- `provider`
- `model`
- `endpoint`
- `apiKey`

### Upload Transcription Endpoint

Configure these settings if you want real upload transcription:

- `transcriptionEndpoint`
- `transcriptionApiKey`
- `transcriptionModel`

### Local Transcription

Use `npm run dev:local` only when local transcription files are already available in `runtime/`.

## Tech Stack

- React
- TypeScript
- Vite
- React Router
- Zustand
- TanStack Query
- Tailwind CSS
- Vitest
- Testing Library

## Project Structure

```text
src/
  app/          application bootstrap and routing setup
  assets/       static app assets bundled through Vite
  components/   reusable UI and product-facing components
  features/     domain logic for meetings, recording, settings, and summary
  lib/          shared helpers for storage, formatting, and endpoint handling
  pages/        route-level screens such as home, import, meetings, and settings
  styles/       global styling entry points and theme layers
  test/         shared testing setup and helpers
  types/        shared TypeScript types used across the app
scripts/        local development helpers and packaging utilities
runtime/        optional local transcription files and helper source
public/         static public assets copied as-is at build time
docs/           working notes and internal project documentation
```

## Validation

```bash
npm run lint
npm run test
npm run build
```
