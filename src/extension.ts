import * as vscode from 'vscode';
import { IndexService } from './services/indexService';
import { SearchService } from './services/searchService';

export function activate(context: vscode.ExtensionContext) {
    // Command to index the current workspace
    let indexCommand = vscode.commands.registerCommand('zoekt-code-search.index', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const indexService = new IndexService(workspaceRoot);

        try {
            await indexService.indexWorkspace();
        } catch (error) {
            console.error('Indexing failed:', error);
        }
    });

    // Command to search code
    let searchCommand = vscode.commands.registerCommand('zoekt-code-search.search', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const searchService = new SearchService(workspaceRoot);

        try {
            await searchService.promptAndSearch();
        } catch (error) {
            console.error('Search failed:', error);
        }
    });

    // Add commands to subscriptions
    context.subscriptions.push(indexCommand, searchCommand);
}

export function deactivate() {
    // Clean up resources if needed
}
