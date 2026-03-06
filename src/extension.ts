import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer/WorkspaceIndexer';
import { ContextAssembler } from './indexer/ContextAssembler';
import { DiagnosticsWatcher } from './indexer/DiagnosticsWatcher';
import { WebviewBridge } from './webview/WebviewBridge';
import { PuterCoderViewProvider } from './webview/panel';
import { PuterAuthServer } from './auth/PuterAuthServer';
import { initializeProviders, ProviderRegistry } from './providers';

let indexer: WorkspaceIndexer;
let diagnosticsWatcher: DiagnosticsWatcher;
let authServer: PuterAuthServer;
let providerRegistry: ProviderRegistry;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Andor is activating...');

	indexer = new WorkspaceIndexer();
	await indexer.initialize();

	diagnosticsWatcher = new DiagnosticsWatcher();
	const contextAssembler = new ContextAssembler(indexer);
	authServer = new PuterAuthServer();
	providerRegistry = initializeProviders(context);
	const bridge = new WebviewBridge(indexer, contextAssembler, diagnosticsWatcher, context, authServer, providerRegistry);

	const viewProvider = new PuterCoderViewProvider(context.extensionUri, bridge);

	// Check for stored Puter token and send to webview when it loads
	const storedToken = await context.secrets.get('puterToken');
	if (storedToken) {
		console.log('[Andor] Found stored Puter token, will send to webview');
		bridge.setPuterToken(storedToken);
	}

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			PuterCoderViewProvider.viewType,
			viewProvider,
			{ webviewOptions: { retainContextWhenHidden: true } },
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('andor.openChat', () => {
			vscode.commands.executeCommand('andor.chatView.focus');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('andor.clearHistory', () => {
			bridge.postMessage({ type: 'historyCleared' });
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('andor.logout', async () => {
			await context.secrets.delete('puterToken');
			vscode.window.showInformationMessage('Signed out of Puter.');
		}),
	);

	context.subscriptions.push({
		dispose: () => {
			indexer.dispose();
			diagnosticsWatcher.dispose();
			authServer.stopServer();
		},
	});

	console.log('Andor activated successfully.');
}

export function deactivate() {
	indexer?.dispose();
	diagnosticsWatcher?.dispose();
	authServer?.stopServer();
}
