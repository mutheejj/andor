# Contributing to Andor

Thank you for your interest in contributing to Andor! 🎉

This document provides guidelines and information about contributing to this project.

---

## 🤝 How to Contribute

### Reporting Bugs

- Use the [GitHub Issues](https://github.com/mutheejj/andor/issues) page
- Search existing issues first to avoid duplicates
- Include:
  - Clear description of the bug
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (VS Code version, OS, etc.)

### Suggesting Features

- Open an issue with the "enhancement" label
- Describe the feature and why it would be useful
- Consider if it fits the project's goals
- Provide examples or mockups if applicable

### Code Contributions

1. **Fork the repository**
   ```bash
   git clone https://github.com/mutheejj/andor.git
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make your changes**
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation

4. **Run tests**
   ```bash
   npm test
   ```

5. **Build the extension**
   ```bash
   # Build webview UI
   cd webview-ui && npm run build && cd ..
   
   # Compile extension
   npm run compile
   ```

6. **Commit your changes**
   ```bash
   git commit -m "feat: add amazing feature"
   ```

7. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

8. **Open a Pull Request**
   - Provide a clear description
   - Link any related issues
   - Include screenshots if UI changes

---

## 🏗️ Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- VS Code with Extension Development Host

### Setup Steps

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd webview-ui && npm install && cd ..
   ```

3. Build the webview UI:
   ```bash
   cd webview-ui && npm run build && cd ..
   ```

4. Open in VS Code:
   ```bash
   code .
   ```

5. Run in development:
   - Press `F5` to launch a new VS Code instance with the extension
   - Or use "Run Extension" from the Run and Debug panel

### Project Structure

```
andor/
├── src/                 # Extension source code
│   ├── indexer/        # Workspace indexing and context
│   ├── webview/        # Webview provider and bridge
│   └── auth/           # Authentication server
├── webview-ui/         # React webview UI
│   ├── src/
│   │   ├── components/ # React components
│   │   └── lib/        # Utilities (Puter.js integration)
├── package.json        # Extension manifest
└── webpack.config.js   # Build configuration
```

---

## 📝 Coding Standards

### TypeScript

- Use strict TypeScript settings
- Provide types for all functions and variables
- Use interfaces for object shapes
- Avoid `any` type when possible

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Prefer `const` over `let` when possible
- Use descriptive variable and function names

### React Components

- Use functional components with hooks
- Use TypeScript interfaces for props
- Keep components small and focused
- Use memoization for expensive operations

### File Naming

- Use PascalCase for components (`ChatPanel.tsx`)
- Use camelCase for utilities (`fileUtils.ts`)
- Use kebab-case for configuration files

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Writing Tests

- Unit tests for pure functions
- Integration tests for extension APIs
- UI tests for React components
- Mock external dependencies (Puter.js, VS Code APIs)

---

## 📚 Documentation

- Update README.md for user-facing changes
- Update inline code comments for complex logic
- Add JSDoc comments for public APIs
- Update this CONTRIBUTING.md when needed

---

## 🚀 Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a release tag on GitHub
4. Publish to VS Code Marketplace (if applicable)

---

## 💬 Getting Help

- Create an issue for questions
- Join our [Discord](https://discord.gg/andor) (coming soon)
- Email: [johnmuthee547@gmail.com](mailto:johnmuthee547@gmail.com)
- X/Twitter: [@mutheejohnke](https://x.com/mutheejohnke)
- Discord: [@johnmuthee](https://discord.com/users/johnmuthee)
- Phone: +254 768 498 013

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Andor! Every contribution helps make this project better. 🙏
