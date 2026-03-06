# Changelog

All notable changes to Andor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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

### Changed
- Renamed from PuterCoder to Andor
- Increased context limits (8 files, 4,000 chars each)
- Improved system prompt for advanced coding agent behavior
- Better diagnostic information in prompts
- Enhanced model mapping for Puter API compatibility

### Fixed
- Fixed Claude Opus 4.5 model ID to Claude Opus 4
- Resolved header visibility issues on scroll
- Fixed runtime errors in ChatPanel component
- Improved error messages for authentication and billing issues

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