import * as vscode from 'vscode';
import { WorkspaceIndexer } from './indexer/WorkspaceIndexer';
import { ContextAssembler } from './indexer/ContextAssembler';
import { DiagnosticsWatcher } from './indexer/DiagnosticsWatcher';
import { WebviewBridge } from './webview/WebviewBridge';
import { PuterCoderViewProvider } from './webview/panel';
import { PuterAuthServer } from './auth/PuterAuthServer';
import { initializeProviders, ProviderRegistry } from './providers';
import { AndorAutocompleteProvider } from './providers/AutocompleteProvider';
import { LearningService } from './learning';

let indexer: WorkspaceIndexer;
let diagnosticsWatcher: DiagnosticsWatcher;
let authServer: PuterAuthServer;
let providerRegistry: ProviderRegistry;
let autocompleteProvider: AndorAutocompleteProvider | undefined;
let learningService: LearningService;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Andor is activating...');

	indexer = new WorkspaceIndexer();
	await indexer.initialize();

	diagnosticsWatcher = new DiagnosticsWatcher();
	const contextAssembler = new ContextAssembler(indexer);
	authServer = new PuterAuthServer();
	providerRegistry = initializeProviders(context);
	learningService = new LearningService(context);
	learningService.initialize().catch(err => console.error('[Andor] Learning init failed:', err));
	const bridge = new WebviewBridge(indexer, contextAssembler, diagnosticsWatcher, context, authServer, providerRegistry, learningService);

	const viewProvider = new PuterCoderViewProvider(context.extensionUri, bridge);

	// Check for stored Puter token and send to webview when it loads
	const storedToken = await context.secrets.get('puterToken');
	if (storedToken) {
		console.log('[Andor] Found stored Puter token, will send to webview');
		bridge.setPuterToken(storedToken);
	}

	// Register inline autocomplete provider
	autocompleteProvider = new AndorAutocompleteProvider(providerRegistry);
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: '**' },
			autocompleteProvider,
		),
	);

	// Status bar item showing Andor status
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '$(hubot) Andor';
	statusBarItem.tooltip = 'Andor AI Assistant';
	statusBarItem.command = 'andor.openChat';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

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

	let autocompleteEnabled = true;
	context.subscriptions.push(
		vscode.commands.registerCommand('andor.toggleAutocomplete', () => {
			if (autocompleteProvider) {
				autocompleteEnabled = !autocompleteEnabled;
				autocompleteProvider.setEnabled(autocompleteEnabled);
				vscode.window.showInformationMessage(
					`Andor Autocomplete: ${autocompleteEnabled ? 'Enabled' : 'Disabled'}`
				);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('andor.setAutocompleteModel', async () => {
			const models = providerRegistry.getAllModels();
			const items = models
				.filter(m => m.model.tier === 'fast')
				.map(m => ({
					label: m.model.name,
					description: `${m.provider.name} - ${m.model.bestFor}`,
					detail: m.model.free ? 'Free' : 'Paid',
					modelSpec: `${m.provider.id}::${m.model.id}`,
				}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a model for autocomplete (fast models recommended)',
			});

			if (selected && autocompleteProvider) {
				autocompleteProvider.setModel(selected.modelSpec);
				vscode.window.showInformationMessage(`Andor Autocomplete model: ${selected.label}`);
			}
		}),
	);

	context.subscriptions.push({
		dispose: () => {
			indexer.dispose();
			diagnosticsWatcher.dispose();
			authServer.stopServer();
			autocompleteProvider?.dispose();
		},
	});

	console.log('Andor activated successfully.');
}

export function deactivate() {
	indexer?.dispose();
	diagnosticsWatcher?.dispose();
	authServer?.stopServer();
	autocompleteProvider?.dispose();
}
