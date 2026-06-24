# Local TXT Reader Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows 11 local offline TXT novel reader demo with a bookshelf, TXT import, drag-and-drop import, reader view, saved progress, and adjustable typography.

**Architecture:** Use Electron so the app can open native Windows file dialogs, read local TXT files, and persist library data without a backend. The main process owns filesystem access and storage, the preload bridge exposes a narrow API, and the renderer implements the polished bookshelf and reading experience.

**Tech Stack:** Electron, plain HTML/CSS/JavaScript, Node.js `fs`, `iconv-lite` for common Chinese TXT encoding fallback.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `src/main.js`
- Create: `src/preload.js`
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/app.js`

- [x] Create the Electron package metadata with `start` and `check` scripts.
- [x] Add a beginner-friendly README with install and run commands.
- [x] Create an Electron main process entry point.
- [x] Create a preload bridge for renderer-safe APIs.
- [x] Create the renderer HTML, CSS, and app logic files.

### Task 2: Local Library And Import

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [x] Store `library.json` and copied book files under Electron `app.getPath("userData")`.
- [x] Add native TXT file dialog import through IPC.
- [x] Add drag-and-drop TXT import by path through IPC.
- [x] Decode UTF-8 and GB18030/GBK-style TXT files with `iconv-lite`.
- [x] Persist book title, excerpt, character count, progress, and last position.

### Task 3: Bookshelf UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.js`

- [x] Show an empty-state bookshelf on first launch.
- [x] Add a top-right import button.
- [x] Support dragging TXT files onto the window.
- [x] Render imported books as refined shelf cards with progress.
- [x] Open a selected book with a visual transition.

### Task 4: Reader UI And Settings

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/app.js`

- [x] Open the reader at the saved position.
- [x] Save reading position while scrolling.
- [x] Add font size, line height, letter spacing, width, and theme controls.
- [x] Persist typography settings locally.
- [x] Add a back-to-bookshelf flow.

### Task 5: Verification

**Files:**
- Read: `package.json`

- [x] Run `npm install`.
- [x] Run `npm run check`.
- [x] Start the Electron app with `npm start` to confirm the demo opens.
