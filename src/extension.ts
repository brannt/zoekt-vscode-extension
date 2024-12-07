import * as vscode from 'vscode';
import { IndexService } from './services/indexService';
import { SearchService } from './services/searchService';
import path from 'path';
import { get } from 'https';

let indexServices: IndexService[] = [];

export function activate(context: vscode.ExtensionContext) {
    let getCommonIndexDir = (workspaceName: string): string => {
        return path.join(context.globalStorageUri.fsPath, workspaceName, '.zoekt-index');
    };

    // Command to index all workspaces
    let indexCommand = vscode.commands.registerCommand('zoekt-code-search.index', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceName = vscode.workspace.name;
        if (!workspaceName || !workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        for (const folder of workspaceFolders) {
            const workspaceRoot = folder.uri.fsPath;
            const service = new IndexService(workspaceRoot, getCommonIndexDir(workspaceName));
            indexServices.push(service);

            try {
                await service.indexWorkspace();
            } catch (error) {
                console.error(`Indexing failed for ${workspaceRoot}:`, error);
            }
        }
    });

    // Command to search code
    let searchCommand = vscode.commands.registerCommand('zoekt-code-search.search', async () => {
        const workspaceName = vscode.workspace.name;
        if (!workspaceName) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [];
        const searchService = new SearchService(workspaceRoots, getCommonIndexDir(workspaceName));

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
    for (const service of indexServices) {
        service.dispose();
    }
}
