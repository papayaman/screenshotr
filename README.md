# 📸 Headless Screenshot Automation Engine

A robust, full-stack browser automation tool built with **Bun**, **Express**, **Puppeteer**, and **Angular**. This engine allows you to configure, execute, and record visual QA journeys, review results in a native gallery, and manage task configurations locally.

## ✨ Features

* **Dual Interface:** Run tasks via the streamlined Angular web dashboard or directly from the terminal via the built-in CLI fallback.
* **In-Browser Gallery:** Review captured screenshots immediately within the dashboard after an automation run is complete.
* **Journey Previewer:** Visually test your clicks, scrolls, and CSS injections in a live browser window before running bulk headless captures.
* **Smart Rendering:** Supports full-page scrolling captures, custom viewports, cache clearing, and lazy-loading wait delays.
* **DOM Manipulation:** Inject global or task-specific CSS, click multiple selectors, and scroll to specific elements dynamically prior to capture.
* **Automated Zipping:** Automatically compiles rendered .png images into a clean .zip bundle for easy distribution.
* **Local Workspace Management:** Manage and delete project configurations directly from the UI sidebar with an integrated file management system.

---

## 🚀 Prerequisites

Ensure you have the following installed on your local machine. If you are developing on **Apple Silicon (M1/M2/M3/M4 macOS)**, the native image compilation engine (`sharp`) requires access to local build environments.

### 📋 Core Software
* [Bun](https://bun.sh/) (v1.0+)
* [Node.js](https://nodejs.org/) (For Angular CLI and ecosystem compatibility)

### 🛠️ macOS Native Build Tools
Before installing dependencies, run the following commands in your terminal to ensure your environment can compile native C++ modules:

1. **Install Apple Command Line Tools** (provides the native C++ compiler)
```bash
xcode-select --install
```
2. **Install node-gyp globally** so Bun can execute background build scripts
```bash
bun add -g node-gyp
```
3. **Install angular-cli globally**.
```bash
bun install -g @angular/cli
```
---

## 🛠️ Installation

1. **Navigate to the root directory:**
``` bash
cd screenshotr
```
2. **Install project dependencies:**
``` bash
bun install
```
3. **Install frontend-specific dependencies:**
``` bash
cd screenshot-ui
bun install
```
4. **Initialize the Angular environment files:**
The background automation dynamic launcher expects the Angular environment architecture to exist so it can seamlessly inject active local backend ports. Run the following to provision the placeholder files while on the screenshot-ui folder:
```bash
mkdir -p src/environments
touch src/environments/environment.ts
touch src/environments/environment.development.ts
```

---

## ⚙️ Environment Configuration

Create a .env file in the root directory. This file controls your local workspace paths:

``` env
PORT=3000
CONFIGS_DIR=_screenshot-configs
SCREENSHOTS_DIR=_screenshots
```

---

## 💻 Usage

### 1. Web Dashboard Mode (Recommended)
Launch both the Express backend and the Angular frontend simultaneously with a single command. The browser will pop open automatically.

```bash
bun run dev
```

### 2. CLI Execution Mode
Perfect for CI/CD pipelines or rapid terminal execution without the UI. It reads the config, runs headless, and outputs a `.zip` file.

```bash
# Run by passing the configuration filename
bun run index.ts project-config
```

---

## 📄 Configuration Structure

Configurations are written in JSON and define the exact sequence of actions for Puppeteer to take. The app dynamically handles combining the `baseUrl` with relative task URLs.

**Example `project-config.json`:**
```json
{
  "baseUrl": "https://example.com",
  "globalWaitDelay": 2000,
  "globalCss": ".cookie-banner { display: none !important; }",
  "tasks": [
    {
      "name": "01-Homepage-Hero",
      "url": "/",
      "width": 1366,
      "height": 800,
      "clearCache": true
    },
    {
      "name": "02-Features-Scrolled",
      "url": "/features",
      "width": 1366,
      "height": "full",
      "scrollToSelector": "#advanced-features",
      "clickSelectors": [".accordion-trigger"],
      "waitDelay": 3000,
      "globalCss": ".floating-chat { display: none; }"
    }
  ]
}
```

### Task Parameters
* `name` (String): The output filename for the image.
* `url` (String): The target URL (can be absolute, or relative if `baseUrl` is set).
* `width` (Number): Viewport width.
* `height` (Number | "full"): Viewport height, or `"full"` for a full-document scroll capture.
* `clearCache` (Boolean, Optional): Disables caching for this specific page load.
* `scrollToSelector` (String, Optional): Scrolls a specific DOM element into the center of the viewport before capturing.
* `clickSelectors` (Array<String>, Optional): Clicks an array of DOM elements (e.g., opening modals/accordions) before capturing.
* `waitDelay` (Number, Optional): Overrides the `globalWaitDelay` for this specific task.
* `globalCss` (String, Optional): Injects a `<style>` tag into the page before capture.

---

## 🏗️ Architecture Stack

* **Backend Engine:** `Bun`, `Express`, `TypeScript`
* **Browser Automation:** `Puppeteer`
* **Image Optimization:** `Sharp`
* **Compression Engine:** `adm-zip`
* **Frontend UI:** `Angular` (Standalone Components, Vite)