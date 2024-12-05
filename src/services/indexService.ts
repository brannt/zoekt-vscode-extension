import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class IndexService {
    private readonly indexDirName = '.zoekt-index';
    private outputChannel: vscode.OutputChannel;

    constructor(private workspaceRoot: string) {
        this.ensureIndexDirectory();
        this.outputChannel = vscode.window.createOutputChannel('Zoekt Indexing');
    }

    private get indexPath(): string {
        return path.join(this.workspaceRoot, this.indexDirName);
    }

    private ensureIndexDirectory(): void {
        if (!fs.existsSync(this.indexPath)) {
            fs.mkdirSync(this.indexPath);
        }
    }

    public async indexWorkspace(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.outputChannel.clear();
            this.outputChannel.show();
            
            const indexProcess = spawn('/Users/brannt/go/bin/zoekt-index', [
                '-index', this.indexPath,
                this.workspaceRoot
            ]);

            indexProcess.stdout.on('data', (data) => {
                this.outputChannel.appendLine(data.toString());
            });

            indexProcess.stderr.on('data', (data) => {
                // Zoekt outputs progress to stderr, so we'll check the content
                const message = data.toString();
                if (message.includes('finished shard')) {
                    // This is a success message
                    this.outputChannel.appendLine(message);
                    vscode.window.showInformationMessage('Indexing completed successfully');
                } else {
                    // This might be a real error
                    this.outputChannel.appendLine(`Error: ${message}`);
                    vscode.window.showErrorMessage(`Indexing error: ${message}`);
                }
            });

            indexProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    const error = `Indexing process exited with code ${code}`;
                    this.outputChannel.appendLine(error);
                    reject(new Error(error));
                }
            });

            indexProcess.on('error', (error) => {
                const errorMessage = `Failed to start indexing process: ${error.message}`;
                this.outputChannel.appendLine(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
                reject(new Error(errorMessage));
            });
        });
    }
}
