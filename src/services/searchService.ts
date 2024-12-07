import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

interface SearchResult {
    file: string;
    line: number;
    content: string;
}

export class SearchService {
    private outputChannel: vscode.OutputChannel;

    constructor(private workspaceRoots: string[], private indexDir: string) {
        this.outputChannel = vscode.window.createOutputChannel('Zoekt Search Results');
    }

    private get indexPath(): string {
        return this.indexDir;
    }

    private async parseZoektOutput(output: string): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;
            this.outputChannel.appendLine(`Processing line: ${line}`);
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
                const [, filePath, lineNum, content] = match;
                const fullPath = await this.resolveFullPath(filePath);
                if (fullPath) {
                    results.push({
                        file: fullPath,
                        line: parseInt(lineNum),
                        content: content.trim()
                    });
                    this.outputChannel.appendLine(`Found result - ${fullPath}:${lineNum}, Content: ${content.trim()}`);
                }
            }
        }

        this.outputChannel.appendLine(`Total results found: ${results.length}`);
        return results;
    }

    private async resolveFullPath(filePath: string): Promise<string | null> {
        for (const root of this.workspaceRoots) {
            const potentialPath = path.join(root, filePath);
            if (await vscode.workspace.fs.stat(vscode.Uri.file(potentialPath))) {
                return potentialPath;
            }
        }
        return null;
    }
    private async showSearchResults(results: SearchResult[]): Promise<void> {
        if (results.length === 0) {
            vscode.window.showInformationMessage('No results found');
            return;
        }

        const items = results.map(result => ({
            label: path.basename(result.file),
            description: `${result.file}:${result.line}`,
            detail: result.content,
            result
        }));

        const selected = await vscode.window.showQuickPick(items, {
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: `Select a result (${results.length} matches found)`
        });

        if (selected) {
            this.outputChannel.appendLine(`Opening file: ${selected.result.file} at line: ${selected.result.line}`);

            try {
                const document = await vscode.workspace.openTextDocument(selected.result.file);
                const editor = await vscode.window.showTextDocument(document);

                const position = new vscode.Position(selected.result.line - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            } catch (error) {
                const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to open file: ${errorMessage}`);
                this.outputChannel.appendLine(`Error opening file: ${errorMessage}`);
            }
        }
    }


    public async searchCode(query: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let output = '';

            // Show the search command being executed
            const searchCommand = `${'/Users/brannt/go/bin/zoekt'} -r -index_dir "${this.indexPath}" "${query}"`;
            this.outputChannel.appendLine(`Executing: ${searchCommand}`);
            this.outputChannel.show();

            const searchProcess = spawn('/Users/brannt/go/bin/zoekt', [
                '-index_dir', this.indexPath,
                query
            ]);

            searchProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
            });

            searchProcess.stderr.on('data', (data) => {
                const message = data.toString();
                this.outputChannel.appendLine(`Search message: ${message}`);

                // Check if the message contains error keywords
                if (/error|failed/i.test(message)) {
                    vscode.window.showErrorMessage(`Search error: ${message}`);
                }
            });

            searchProcess.on('close', async (code) => {
                this.outputChannel.appendLine(`Search process exited with code: ${code}`);
                if (code === 0) {
                    const results = await this.parseZoektOutput(output);
                    await this.showSearchResults(results);
                    resolve();
                } else {
                    const error = `Search failed with code ${code}`;
                    this.outputChannel.appendLine(error);
                    reject(new Error(error));
                }
            });

            searchProcess.on('error', (error) => {
                const errorMessage = `Failed to start search process: ${error.message}`;
                this.outputChannel.appendLine(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
                reject(new Error(errorMessage));
            });
        });
    }

    public async promptAndSearch(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Enter search query',
            placeHolder: 'Search across your codebase'
        });

        if (query) {
            await this.searchCode(query);
        }
    }
}
