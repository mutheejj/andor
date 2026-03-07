# Andor

> **Advanced AI Coding Agent for VS Code** — Multi-provider AI assistant with live file writes, terminal commands, and full workspace awareness.

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.74.0-blue?logo=visual-studio-code)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-green)](https://github.com/mutheejj/andor)

---

## What is Andor?

**Andor** is an intelligent AI coding assistant embedded in VS Code. Unlike typical chatbots, Andor is a **proactive agent** that understands your entire codebase and can take real actions:

- **Read & understand** your entire workspace (100+ files)
- **Write and modify files** automatically during AI streaming
- **Run terminal commands** (build, test, install, git)
- **Debug errors** with full diagnostic context
- **Refactor safely** across multiple files without breaking dependencies
- **Continue complex tasks** across multiple prompts with checkpoints

---

## Key Features

### Multi-Provider AI Support
- **Puter.js** — Free tier with Claude, GPT-4o, Gemini, DeepSeek, Llama (no API key needed)
- **NVIDIA NIM** — High-performance models (Kimi K2, DeepSeek, Llama, Qwen, Codestral)
- **OpenRouter** — Access to 100+ AI models
- **Google Gemini** — Direct Gemini API support
- **Custom Providers** — Bring your own API keys

### Agent Capabilities
- **Live File Writes** — Files are written instantly as AI streams `write:path` blocks (no manual Apply needed)
- **Terminal Integration** — Execute commands with live output display
- **Smart Context Assembly** — Automatically includes relevant files, filtered by relevance score
- **Full Workspace Awareness** — AI sees your complete file tree (grouped by directory)
- **Diagnostics Integration** — Real-time errors and warnings in context
- **Multi-file Coordination** — AI understands dependencies and updates all affected files

### Advanced Settings Panel
- **Memory Management** — Learned patterns and project context
- **Workspace Indexing** — Full project indexing with progress tracking
- **API Key Management** — Secure storage for all provider keys
- **Web Search** — Brave Search API integration for documentation lookup
- **Vision Support** — Image processing capabilities

### Workflow Features
- **Checkpoints** — Auto-saved conversation states, revert anytime
- **Task Completion Detection** — AI knows when work is done
- **Continue Button** — Resume multi-step operations
- **Prompt Editing** — Edit and resend previous messages
- **Command Approval** — Safety controls for destructive commands

### Chat Modes
- **Agent Mode** — Full capabilities: files, terminal, edits
- **Chat Mode** — Discussion only, no file modifications
- **Thinking Mode** — Step-by-step reasoning before acting

---

## Installation

### From VS Code Marketplace
```
Search "Andor" in VS Code Extensions and click Install
```

### From Source
```bash
# Clone the repository
git clone https://github.com/mutheejj/andor.git
cd andor

# Install dependencies
npm install

# Build the webview UI
cd webview-ui && npm install && npm run build && cd ..

# Compile the extension
npm run compile

# Run in development mode
F5  # Opens a new VS Code window with the extension loaded
```

---

## Quick Start

1. **Open Andor**: Click the Andor icon in the left sidebar or run `Andor: Open Chat` from the command palette

2. **Choose a Model**: Select from Puter (free), NVIDIA, OpenRouter, or configure your own API keys

3. **Start Coding**:
   - *"Refactor this component to use hooks"*
   - *"Fix the TypeScript errors in src/utils"*
   - *"Create a new API endpoint for user authentication"*
   - *"Run npm test and fix any failing tests"*

4. **Watch it work**: Andor analyzes, plans, writes files, and runs commands automatically

---

## Usage Examples

### Multi-File Refactoring
```
"Convert all class components in src/components to functional components with hooks"
```
Andor will:
1. Scan all files in src/components
2. Identify class components
3. Plan the conversion
4. Write updated files in dependency order
5. Update imports across all affected files
6. Run build to verify

### Debugging with Context
```
"I'm getting a 'Cannot find module' error when importing utils"
```
Andor will:
1. Check your imports and file structure
2. Look at real-time diagnostics
3. Examine the workspace index for file locations
4. Suggest or apply fixes
5. Run the build to verify

### New Features
```
"Add a dark mode toggle to the settings page"
```
Andor will:
1. Find the settings component
2. Add the toggle UI
3. Implement state management
4. Apply theme changes
5. Update related files

### Terminal Commands
```
"Run the test suite and tell me what's failing"
```
Andor will:
1. Execute `npm test` or your test command
2. Parse the output for errors
3. Identify failing tests
4. Suggest fixes or apply them directly

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   VS Code       │────▶│  Extension Host │────▶│   AI Providers  │
│   Webview UI    │◄────│  (Node.js)      │◄────│   (Puter,       │
│   (React)       │     │                 │     │    NVIDIA, etc) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Workspace      │     │  File System    │
│  Indexer        │     │  & Terminal     │
└─────────────────┘     └─────────────────┘
```

- **Webview UI**: React + TypeScript + Tailwind CSS with streaming support
- **Extension Host**: VS Code API, file system, terminal access, SecretStorage
- **Workspace Indexer**: Full project indexing with language detection
- **Context Assembler**: Intelligent file scoring and selection
- **Provider Registry**: Multi-provider model management with fallback

---

## Configuration

### Setting up API Keys
1. Open Andor Settings (⚙ icon)
2. Navigate to the provider tab
3. Enter your API key (securely stored in VS Code SecretStorage)
4. Test the connection

### Supported Providers
- **Puter** — Free tier available, sign in with Puter account
- **NVIDIA NIM** — Requires NVIDIA API key (free tier available)
- **OpenRouter** — Requires OpenRouter API key
- **Google Gemini** — Requires Gemini API key

### Workspace Settings
- **Memory**: Enable/disable learned context
- **Indexing**: Auto-index on startup, manual reindex
- **Context Limits**: Configure max files and relevance thresholds

---

## Safety & Security

- **Command Approval**: Destructive commands (rm, git push) require approval
- **Allowlist**: Auto-approve frequently used safe commands
- **Secure Storage**: API keys stored in VS Code SecretStorage
- **Live Writes**: Files written immediately with undo support via checkpoints
- **No Data Leakage**: Code context never leaves your machine except to chosen AI provider

---

## Contributing

We welcome contributors! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas to Contribute
- **New AI Providers**: Add support for additional AI services
- **UI Improvements**: Themes, layouts, accessibility
- **Language Support**: Better parsing for Python, Go, Rust, etc.
- **Testing**: Unit and integration tests
- **Documentation**: Guides, examples, tutorials

---

## Roadmap

- [x] **Multi-provider Support** — NVIDIA, OpenRouter, Gemini
- [x] **Live File Writes** — Auto-apply during streaming
- [x] **Full Workspace Indexing** — 100+ file awareness
- [x] **Advanced Settings Panel** — Memory, indexing, API keys
- [x] **Terminal Integration** — Command execution with output
- [x] **Checkpoints** — Conversation state management
- [ ] **Git Integration** — Commit, branch, PR descriptions
- [ ] **Test Generation** — Auto-generate unit tests
- [ ] **Code Review** — Review PRs and suggest improvements
- [ ] **Custom Skills** — Teach Andor your codebase patterns
- [ ] **Voice Input** — Speak your requests
- [ ] **Offline Mode** — Local model support

---

## License

[MIT](LICENSE) — Open source, free to use, modify, and distribute.

---

## Acknowledgments

- **[Puter](https://puter.com)** — AI infrastructure and API
- **[VS Code](https://code.visualstudio.com/)** — Extension platform
- **[NVIDIA](https://nvidia.com)** — NIM API for high-performance models
- **[OpenRouter](https://openrouter.ai)** — Unified AI model access
- **Contributors** — Everyone who helps make Andor better

---

## Community & Support

- **Issues**: [GitHub Issues](https://github.com/mutheejj/andor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mutheejj/andor/discussions)
- **Email**: [johnmuthee547@gmail.com](mailto:johnmuthee547@gmail.com)
- **X/Twitter**: [@mutheejohnke](https://x.com/mutheejohnke)
- **GitHub**: [@mutheejj](https://github.com/mutheejj)

---

Built with ❤️ by developers, for developers

