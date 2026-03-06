/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'vscode-bg': 'var(--vscode-sideBar-background)',
        'vscode-fg': 'var(--vscode-sideBar-foreground)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-badge-bg': 'var(--vscode-badge-background)',
        'vscode-badge-fg': 'var(--vscode-badge-foreground)',
        'vscode-editor-bg': 'var(--vscode-editor-background)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-link': 'var(--vscode-textLink-foreground)',
        'vscode-desc': 'var(--vscode-descriptionForeground)',
      },
      fontSize: {
        'vscode': 'var(--vscode-font-size)',
      },
      fontFamily: {
        'vscode': 'var(--vscode-font-family)',
        'vscode-editor': 'var(--vscode-editor-font-family)',
      },
    },
  },
  plugins: [],
};
