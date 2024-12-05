import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

interface SearchResult {
    file: string;
    line: number;
    content: string;
}

export class SearchService {
    private readonly indexDirName = '.zoekt-index';
    private outputChannel: vscode.OutputChannel;

    constructor(private workspaceRoot: string) {
        this.outputChannel = vscode.window.createOutputChannel('Zoekt Search Results');
    }

    private get indexPath(): string {
        return path.join(this.workspaceRoot, this.indexDirName);
    }

    private parseZoektOutput(output: string): SearchResult[] {
        const results: SearchResult[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            // Each result line is in format: "path/to/file.ext:lineNumber:content"
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
                const [, filePath, lineNum, content] = match;
                results.push({
                    file: filePath,
                    line: parseInt(lineNum),
                    content: content.trim()
                });
                this.outputChannel.appendLine(`Found result - File: ${filePath}, Line: ${lineNum}, Content: ${content.trim()}`);
            }
        }

        this.outputChannel.appendLine(`Total results found: ${results.length}`);
        return results;
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
            const filePath = path.join(this.workspaceRoot, selected.result.file);
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            
            // Go to the specific line
            const position = new vscode.Position(selected.result.line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        }
    }

    public async searchCode(query: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let output = '';
            
            // Show the search command being executed
            const searchCommand = `${'/Users/brannt/go/bin/zoekt'} -index_dir "${this.indexPath}" "${query}"`;
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
                const errorMessage = `Search error: ${data}`;
                this.outputChannel.appendLine(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
            });

            searchProcess.on('close', async (code) => {
                this.outputChannel.appendLine(`Search process exited with code: ${code}`);
                if (code === 0) {
                    const results = this.parseZoektOutput(output);
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
