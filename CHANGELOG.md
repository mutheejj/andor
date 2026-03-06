# Changelog

All notable changes to Andor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] - 2025-03-07

### Added — Multi-Provider Architecture
- **Provider system** — New `src/providers/` module with base interfaces, provider registry, and smart fallback logic
- **6 AI providers** — Puter.js (default, free), NVIDIA NIM, Groq, Google Gemini, Mistral AI, OpenRouter
- **70+ models** available across all providers, with tier badges (fast/balanced/powerful) and FREE indicators
- **Secure API key storage** using VS Code SecretStorage API (`andor.apikey.<providerId>`)
- **Provider registry** with automatic model resolution, connection testing, and model caching
- **Smart fallback** — automatic retry with alternative providers on rate limit (429) or server errors (5xx)
- **Extension-host streaming** — non-Puter providers stream directly from the extension host via SSE parsing
- **Dynamic model fetching** for OpenRouter (fetches available models from API)

### Added — Settings Panel
- **Provider cards** showing connection status (configured/untested/unconfigured), model count, and API key management
- **API key management** — add, delete, test connection, with links to provider key pages
- **Command allowlist** editor for managing auto-approved terminal command patterns

### Added — UI Improvements
- **Grouped model selector** with search, provider sections, tier icons, FREE/context badges
- **Command approval dialog** — Allow Once, Always Allow (with pattern), Deny actions for terminal commands
- **Auto-allowed commands** — safe commands (git status, npm run build, tsc, etc.) run without approval
- **Allowlist file** at `.vscode/andor-allowlist.json` with glob pattern matching
- **File operation cards** — inline display for modified/created/deleted files with diff preview
- **Terminal output component** — collapsible inline terminal output with success/failure styling
- **Settings button** in header toolbar

### Changed
- **Model selector** rewritten from simple dropdown to searchable grouped dropdown with provider context
- **ChatPanel** updated to route Puter models through webview and non-Puter models through extension host
- **WebviewBridge** extended with provider, command approval, and streaming message handlers
- **System prompt** enhanced with coding principles, response format guidelines, and security rules
- **Types** expanded with ProviderInfo, ModelInfo, CommandApprovalRequest, AllowlistFile interfaces
- Version bumped to 0.1.0

### Previous (0.0.x)
- Multiple AI model support (Claude Sonnet 4, Claude Opus 4, GPT-4o, Gemini 2.5 Pro, DeepSeek V3, Llama 4, etc.)
- Free tier model indicators
- Checkpoint/revert system for conversation states
- Prompt editing capability for previous messages
- Task completion detection with "Continue" button
- Advanced context assembly with workspace file listing
- Enhanced error handling for insufficient funds
- Modern Windsurf-like UI redesign
- Sticky headers and improved UX
- File reading capability for AI agent

---

## [0.0.1] - 2025-03-06

### Added
- Initial release of Andor (formerly PuterCoder)
- Basic AI chat functionality with Puter.js integration
- File writing and terminal command execution
- Context file inclusion for AI prompts
- VS Code diagnostics awareness
- Authentication with Puter.com
- Basic UI with model selection
- Webview-based chat interface

---

## [Previous Versions]

### PuterCoder 0.0.x
- Initial development phase
- Basic chat functionality
- File operations support
- Terminal integration