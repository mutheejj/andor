# Security Policy

This document outlines the security practices for Andor.

---

## 🛡️ Security Model

Andor is a VS Code extension that:
- Runs AI models via Puter.js API
- Has access to your workspace files
- Can execute terminal commands
- Can read and write files

### Data Flow
```
VS Code Extension → Puter API (HTTPS) → AI Model Response
                     ↓
            File System Operations
            Terminal Commands
```

---

## 🔒 What We Protect

### Authentication
- Puter tokens are stored securely in VS Code's secret storage
- Tokens are never logged or exposed
- Tokens are only sent to Puter's API endpoints

### File Access
- Andor only accesses files when explicitly requested by the AI
- File operations are logged in the extension host
- No files are sent to external services except through Puter API

### Code Execution
- Terminal commands run in the integrated terminal
- Commands are visible in the terminal history
- No hidden or background execution

---

## 🚨 Potential Risks

### AI Model Inputs
- Code snippets are sent to Puter's AI models
- Context files are included when relevant
- **Note**: Review Puter's privacy policy for data handling

### Terminal Commands
- AI can suggest and run terminal commands
- Commands execute with your user permissions
- **Recommendation**: Review suggested commands before execution

### File Modifications
- AI can write to any file in your workspace
- No sandboxing for file operations
- **Recommendation**: Use checkpoints to revert changes

---

## 📋 Reporting Security Issues

If you discover a security vulnerability, please report it privately:

### Primary Contact
- **Email**: [johnmuthee547@gmail.com](mailto:johnmuthee547@gmail.com)
- **Private Issue**: Create a draft PR or private issue on GitHub

### What to Include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code

### Response Time
- We aim to respond within 48 hours
- Critical issues will be prioritized
- We'll coordinate disclosure timelines

---

## 🔍 Security Best Practices

### For Users
1. **Review AI Suggestions**: Always review code changes before applying
2. **Use Checkpoints**: Create checkpoints before major operations
3. **Monitor Terminal**: Watch terminal command execution
4. **Secure Your Account**: Use a strong Puter password
5. **Regular Updates**: Keep the extension updated

### For Developers
1. **Principle of Least Privilege**: Only request necessary permissions
2. **Input Validation**: Validate all user inputs
3. **Secure Storage**: Use VS Code's secure storage for secrets
4. **Audit Logs**: Log sensitive operations for debugging
5. **Regular Security Reviews**: Review code for security issues

---

## 🛠️ Security Features

### Built-in Protections
- **Checkpoints**: Automatic state snapshots for easy rollback
- **Command Visibility**: All terminal commands are visible
- **Edit History**: Track all file modifications
- **Error Handling**: Graceful failure with error messages

### User Controls
- **Model Selection**: Choose which AI model to use
- **Context Control**: See which files are included in context
- **Manual Approval**: Review changes before applying
- **Revert Capability**: Undo any changes made by the AI

---

## 📜 Third-Party Services

### Puter.js
- **Purpose**: AI model API and authentication
- **Data Handling**: Review [Puter Privacy Policy](https://puter.com/privacy)
- **Security**: HTTPS encrypted connections
- **Authentication**: Token-based auth with secure storage

---

## 🔧 Security Updates

### Patch Process
1. Security issues are triaged immediately
2. Patches are developed and tested
3. Updates are released as soon as possible
4. Security advisories are published

### Notification
- Updates will be announced in the changelog
- Critical issues may trigger automatic update notifications
- Follow [@mutheejohnke](https://x.com/mutheejohnke) for security announcements

---

## 🤝 Contributing to Security

We welcome security contributions:
- Security audits
- Vulnerability reports
- Security feature suggestions
- Documentation improvements

See [CONTRIBUTING.md](CONTRIBUTING.md) for general contribution guidelines.

---

## 📄 License

This security policy is licensed under the MIT License, same as the project.

---

Thank you for helping keep Andor secure! 🛡️
