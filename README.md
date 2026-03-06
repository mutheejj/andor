# ⬡ Andor

<p align="center">
  <img src="https://raw.githubusercontent.com/mutheejj/andor/main/images/icon.jpeg" alt="Andor Icon" width="128" height="128">
</p>

> **Advanced AI Coding Agent for VS Code** — Powered by Puter.js, no API keys needed.

![Andor Cover](https://raw.githubusercontent.com/mutheejj/andor/main/images/cover.jpeg)

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.74.0-blue?logo=visual-studio-code)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-green)](https://github.com/mutheejj/andor)

---

## 🚀 What is Andor?

**Andor** is an intelligent AI coding assistant that lives inside VS Code. Unlike typical AI chatbots, Andor is a **proactive coding agent** that can:

- **Read & understand** your entire codebase
- **Write and modify files** directly
- **Run terminal commands** (build, test, install)
- **Debug errors** with full diagnostic context
- **Refactor code** safely across multiple files
- **Continue complex tasks** across multiple prompts

All without needing API keys — just sign in with [Puter](https://puter.com) and start coding.

---

## ✨ Features

### 🤖 AI-Powered Coding
- **Multiple AI Models**: Claude Sonnet 4, Claude Opus 4, GPT-4o, Gemini 2.5 Pro, DeepSeek V3, Llama 4, and more
- **Free Tier Models**: Use GPT-4o Mini, Gemini Flash, DeepSeek, and Llama models at no cost
- **No API Keys**: Authenticate once with Puter, no configuration needed

### 🛠️ Agent Capabilities
- **File Operations**: Create, read, update files with `write:path` blocks
- **Terminal Integration**: Run commands with `run` blocks
- **Smart Context**: Automatically includes relevant files from your workspace
- **Diagnostics Aware**: Sees errors and warnings in real-time
- **Multi-step Tasks**: Handles complex refactors that span multiple files

### 🔄 Advanced Workflow
- **Checkpoints**: Auto-saved conversation states — revert anytime
- **Prompt Editing**: Edit and resend previous messages
- **Task Completion Detection**: Knows when a task is done or needs to continue
- **Continue Button**: Resume complex multi-step operations

### 🎨 Modern UI
- **Windsurf-like Interface**: Clean, modern, distraction-free design
- **Sticky Headers**: Always-visible controls even when scrolling
- **Syntax Highlighting**: Beautiful code blocks with language detection
- **Dark/Light Theme**: Adapts to your VS Code theme automatically

---

## 📦 Installation

### From VS Code Marketplace (Coming Soon)
```
Search "Andor" in VS Code Extensions
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

## 🎯 Quick Start

1. **Open the Andor panel**: Click the Andor icon in the left sidebar or run `Andor: Open Chat` from the command palette

2. **Sign in**: Click "Sign in" and authenticate with Puter (takes 10 seconds)

3. **Start coding**: Ask Andor anything:
   - *"Refactor this component to use hooks"*
   - *"Fix the TypeScript errors in src/utils"*
   - *"Create a new API endpoint for user authentication"*
   - *"Explain how this codebase works"*

4. **Watch it work**: Andor will analyze, plan, and execute — writing files and running commands as needed

---

## 💡 Usage Examples

### Refactoring
```
"Refactor all class components in src/components to functional components with hooks"
```
Andor will:
1. Find all class components
2. Plan the conversion
3. Write the updated files
4. Report what changed

### Debugging
```
"I'm getting a 'Cannot find module' error when importing utils"
```
Andor will:
1. Check your imports and file structure
2. Look at the diagnostics
3. Suggest or apply fixes
4. Run the build to verify

### New Features
```
"Add a dark mode toggle to the settings page"
```
Andor will:
1. Find the settings component
2. Add the toggle UI
3. Implement the state management
4. Apply theme changes

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   VS Code       │────▶│  Extension Host │────▶│   Puter AI      │
│   Webview UI    │◄────│  (Node.js)      │◄────│   (Claude,      │
│   (React)       │     │                 │     │    GPT, etc.)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Workspace      │     │  File System    │
│  Indexer        │     │  Operations     │
└─────────────────┘     └─────────────────┘
```

- **Webview UI**: React + TypeScript + Tailwind CSS
- **Extension Host**: VS Code API, file system, terminal access
- **Workspace Indexer**: Real-time file tracking, symbols, imports
- **Context Assembler**: Intelligent file selection for AI context

---

## 🤝 Contributing

We welcome contributors! Whether you're fixing a bug, adding a feature, or improving documentation, your help is appreciated.

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Areas to Contribute
- **New AI Models**: Add support for new Puter models
- **UI Improvements**: Better themes, layouts, accessibility
- **Language Support**: Better parsing for Python, Go, Rust, etc.
- **Testing**: Add unit and integration tests
- **Documentation**: Improve guides, add examples

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 🛣️ Roadmap

- [ ] **Git Integration**: Commit, branch, PR descriptions
- [ ] **Test Generation**: Auto-generate unit tests
- [ ] **Code Review**: Review PRs and suggest improvements
- [ ] **Multi-file Edits**: Atomic changes across many files
- [ ] **Custom Skills**: Teach Andor your codebase patterns
- [ ] **Voice Input**: Speak your requests
- [ ] **Offline Mode**: Local model support

---

## 📄 License

[MIT](LICENSE) — Open source, free to use, modify, and distribute.

---

## 🙏 Acknowledgments

- **[Puter](https://puter.com)** — For the AI infrastructure and API
- **[VS Code](https://code.visualstudio.com/)** — For the excellent extension platform
- **[Claude](https://anthropic.com/claude)**, **[OpenAI](https://openai.com)**, **[Google](https://deepmind.google/)**, **[DeepSeek](https://deepseek.com)**, **[Meta](https://ai.meta.com/)** — For the amazing AI models
- **Contributors** — Everyone who helps make Andor better

---

## 💬 Community & Contact

- **Issues**: [GitHub Issues](https://github.com/mutheejj/andor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mutheejj/andor/discussions)
- **Discord**: [Join our server](https://discord.gg/andor) (coming soon)
- **Email**: [johnmuthee547@gmail.com](mailto:johnmuthee547@gmail.com)
- **X/Twitter**: [@mutheejohnke](https://x.com/mutheejohnke)
- **GitHub**: [@mutheejj](https://github.com/mutheejj)
- **Discord**: [@johnmuthee](https://discord.com/users/johnmuthee)
- **Phone**: +254 768 498 013

---

<p align="center">
  <strong>Built with ❤️ by developers, for developers</strong>
</p>

<p align="center">
  <a href="https://github.com/mutheejj/andor">⭐ Star us on GitHub</a> •
  <a href="https://x.com/mutheejohnke">🐦 Follow on X</a>
</p>
