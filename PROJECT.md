# Andor - Advanced AI Coding Agent for VS Code

## 📋 Overview

Andor is an open-source VS Code extension that brings advanced AI coding capabilities directly to your editor. Powered by Puter.js, Andor acts as a proactive coding agent that can read, understand, modify, and debug your codebase.

## 🎯 Problem It Solves

### For Developers
- **Context Switching**: No need to copy-paste between AI chat and your editor
- **File Management**: AI can directly read/write files and run commands
- **Code Understanding**: Analyzes your entire codebase for context-aware assistance
- **Debugging**: Sees errors and diagnostics in real-time

### For Teams
- **Consistency**: Standardized AI assistance across the team
- **Knowledge Transfer**: AI understands your codebase patterns
- **Productivity**: Faster development with AI-powered refactoring and debugging

## 🚀 Key Features

### AI-Powered Coding
- **Multiple Models**: Claude Sonnet 4, Claude Opus 4, GPT-4o, Gemini 2.5 Pro, DeepSeek V3, Llama 4
- **Free Tier**: Use GPT-4o Mini, Gemini Flash, DeepSeek, and Llama models at no cost
- **No API Keys**: Simple authentication with Puter

### Agent Capabilities
- **File Operations**: Create, read, update files directly
- **Terminal Integration**: Run build, test, and other commands
- **Smart Context**: Automatically includes relevant workspace files
- **Diagnostics Aware**: Sees errors and warnings as they appear

### Advanced Workflow
- **Checkpoints**: Auto-saved conversation states for easy rollback
- **Prompt Editing**: Edit and resend previous messages
- **Task Completion**: Detects when tasks are done or need continuation
- **Continue Button**: Resume complex multi-step operations

### Modern UI
- **Windsurf-like Design**: Clean, modern interface
- **Sticky Headers**: Always-visible controls
- **Syntax Highlighting**: Beautiful code blocks
- **Theme Adaptive**: Matches your VS Code theme

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Search for "Andor" in Extensions
3. Click Install

### From Source
```bash
git clone https://github.com/mutheejj/andor.git
cd andor
npm install
cd webview-ui && npm install && npm run build && cd ..
npm run compile
```

## 🎯 Quick Start

1. **Open Andor**: Click the Andor icon in the sidebar
2. **Sign In**: Authenticate with Puter (10 seconds)
3. **Start Coding**: Ask anything - "Refactor this component", "Fix the errors", "Add a new feature"

## 🏗️ Architecture

```
VS Code Webview ← Extension Host → Puter AI
       ↓              ↓
   React UI      File System
                    Terminal
```

## 🤝 Contributing

We welcome all contributors! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas to Contribute
- New AI model support
- UI improvements
- Language support
- Testing
- Documentation

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 💬 Contact

- **Email**: [johnmuthee547@gmail.com](mailto:johnmuthee547@gmail.com)
- **X/Twitter**: [@mutheejohnke](https://x.com/mutheejohnke)
- **GitHub**: [@mutheejj](https://github.com/mutheejj)
- **Issues**: [GitHub Issues](https://github.com/mutheejj/andor/issues)
- **Discord**: [@johnmuthee](https://discord.com/users/johnmuthee)
- **Phone**: +254 768 498 013

---

Built with ❤️ by developers, for developers
