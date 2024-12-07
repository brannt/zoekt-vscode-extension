import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import * as cron from 'node-cron';
import now from 'performance-now';

export class IndexService {
    private readonly indexDirName = '.zoekt-index';
    private outputChannel: vscode.OutputChannel;
    private cronJob?: cron.ScheduledTask;
    private statusBarItem: vscode.StatusBarItem;
    private isIndexing = false;
    private disposables: vscode.Disposable[] = [];

    constructor(private workspaceRoot: string, private indexDir: string) {
        this.ensureIndexDirectory();
        this.outputChannel = vscode.window.createOutputChannel('Zoekt Indexing');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.setupFileWatcher();
        this.setupCronJob();
    }

    private get indexPath(): string {
        return this.indexDir;
    }

    private ensureIndexDirectory(): void {
        // this.outputChannel.appendLine(`Ensuring index directory exists: ${this.indexPath}`);
        if (!fs.existsSync(this.indexPath)) {
            fs.mkdirSync(this.indexPath, { recursive: true});
        }
    }

    private setupFileWatcher(): void {
        const watcher = vscode.workspace.createFileSystemWatcher('**/!(' + this.indexDirName + ')/**/*', false, false, false);

        const debounceTimeout = 5000; // 5 seconds
        let timeoutId: NodeJS.Timeout;

        const handleFileChange = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(async () => {
                const config = vscode.workspace.getConfiguration('zoektCodeSearch');
                if (config.get<boolean>('indexOnSave') && !this.isIndexing) {
                    await this.indexWorkspace();
                }
            }, debounceTimeout);
        };

        watcher.onDidChange(handleFileChange);
        watcher.onDidCreate(handleFileChange);
        watcher.onDidDelete(handleFileChange);

        this.disposables.push(watcher);
    }

    private setupCronJob(): void {
        const config = vscode.workspace.getConfiguration('zoektCodeSearch');
        const schedule = config.get<string>('cronSchedule');

        if (this.cronJob) {
            this.cronJob.stop();
        }

        if (schedule && cron.validate(schedule)) {
            this.cronJob = cron.schedule(schedule, async () => {
                if (!this.isIndexing) {
                    await this.indexWorkspace();
                }
            });
        }

        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('zoektCodeSearch.cronSchedule')) {
                this.setupCronJob();
            }
        });
    }

    public async indexWorkspace(fromCommandPalette: boolean = false): Promise<void> {
        if (this.isIndexing) {
            this.outputChannel.appendLine('Indexing already in progress...');
            return;
        }

        this.isIndexing = true;
        this.statusBarItem.text = '$(sync~spin) Indexing...';
        this.statusBarItem.show();

        const startTime = now();
        this.outputChannel.appendLine(`Starting indexing for workspace: ${this.workspaceRoot}`);
        this.outputChannel.appendLine(`Using index directory: ${this.indexPath}`);
        this.outputChannel.appendLine(`Executing zoekt command: /Users/brannt/go/bin/zoekt-git-index -index ${this.indexPath} ${this.workspaceRoot}`);
        let indexSize = 0;

        return new Promise((resolve, reject) => {
            this.outputChannel.clear();
            this.outputChannel.show();

            const indexProcess = spawn('/Users/brannt/go/bin/zoekt-git-index', [
                '-index', this.indexPath,
                this.workspaceRoot
            ]);

            indexProcess.stdout.on('data', (data) => {
                this.outputChannel.appendLine(data.toString());
            });

            indexProcess.stderr.on('data', (data) => {
                const message = data.toString();
                this.outputChannel.appendLine(message);
                if (message.includes('finished shard')) {
                    if (fromCommandPalette) {
                        vscode.window.showInformationMessage(`Indexing ${this.workspaceRoot} completed successfully`);
                    }
                }
                if (/error|failed/i.test(message)) {
                    vscode.window.showErrorMessage(`Search error while indexing ${this.workspaceRoot}: ${message}`);
                }
            });

            indexProcess.on('close', async (code) => {
                this.isIndexing = false;
                this.statusBarItem.hide();
                const endTime = now();
                const duration = (endTime - startTime) / 1000; // Convert to seconds

                if (code === 0) {
                    // Get index size
                    indexSize = await this.getDirectorySize(this.indexPath);

                    const config = vscode.workspace.getConfiguration('zoektCodeSearch');
                    if (config.get<boolean>('enablePerformanceMetrics')) {
                        this.outputChannel.appendLine('\nPerformance Metrics:');
                        this.outputChannel.appendLine(`Duration: ${duration.toFixed(2)} seconds`);
                        this.outputChannel.appendLine(`Index Size: ${(indexSize / 1024 / 1024).toFixed(2)} MB`);
                    }
                    resolve();
                } else {
                    const error = `Indexing process exited with code ${code}`;
                    this.outputChannel.appendLine(error);
                    reject(new Error(error));
                }
            });

            indexProcess.on('error', (error) => {
                this.isIndexing = false;
                const errorMessage = `Failed to start indexing process: ${error.message}`;
                this.outputChannel.appendLine(errorMessage);
                vscode.window.showErrorMessage(errorMessage);
                reject(new Error(errorMessage));
            });
        });
    }

    private async getDirectorySize(dirPath: string): Promise<number> {
        let size = 0;
        const files = await fs.promises.readdir(dirPath);

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                size += await this.getDirectorySize(filePath);
            } else {
                size += stats.size;
            }
        }

        return size;
    }

    public dispose(): void {
        if (this.cronJob) {
            this.cronJob.stop();
        }
        this.disposables.forEach(d => d.dispose());
    }
}
