// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// 检查 pubspec.yaml 是否包含 build_runner 依赖
	function checkBuildRunner(cwd: string): boolean {
		const pubspecPath = require('path').join(cwd, 'pubspec.yaml');
		if (!require('fs').existsSync(pubspecPath)) {return false;}
		const yamlContent = require('fs').readFileSync(pubspecPath, 'utf8');
		const lines = yamlContent.split(/\r?\n/);
		let inDeps = false;
		for (const line of lines) {
			const trimmed = line.trim();
			if (/^(dev_dependencies|dependencies):/.test(trimmed)) {
				inDeps = true;
				continue;
			}
			// 离开依赖区块（遇到新的顶级 key）
			// if (/^[^\s].*:/.test(trimmed) && !/^(dev_dependencies|dependencies):/.test(trimmed)) {
			// 	inDeps = false;
			// }
			// 检查未被注释且格式为 build_runner: ...（支持缩进）
			if (inDeps && /^\s*build_runner:\s*[^#\s]+/.test(line) && !/^\s*#/.test(line)) {
				return true;
			}
		}
		return false;
	}

	function runBuildRunnerCommand(cwd: string, command: string, label: string) {
		if (!checkBuildRunner(cwd)) {
			vscode.window.showWarningMessage('pubspec.yaml 未检测到 build_runner 依赖（或已被注释），命令未执行。');
			return;
		}
		const outputChannel = vscode.window.createOutputChannel('Flutter Build Runner');
		outputChannel.show(true);
		outputChannel.appendLine(command);
		const cp = require('child_process');
		if (label === 'watch') {
			// 后台持续运行
			const args = ['run', 'build_runner', 'watch', '--delete-conflicting-outputs'];
			const child = cp.spawn('dart', args, { cwd, shell: true });
			child.stdout.on('data', (data: Buffer) => {
				outputChannel.appendLine(data.toString());
			});
			child.stderr.on('data', (data: Buffer) => {
				outputChannel.appendLine(data.toString());
			});
			child.on('close', (code: number) => {
				outputChannel.appendLine(`[watch 进程已退出，代码: ${code}]`);
			});
			vscode.window.showInformationMessage('已在后台启动 Flutter build_runner watch，详情见输出面板。');
		} else {
			interface ExecError extends Error {
				code?: number;
				signal?: string;
			}
			cp.exec(command, { cwd }, (error: ExecError | null, stdout: string, stderr: string) => {
				if (error) {
					outputChannel.appendLine(`[错误] ${error.message}`);
				}
				if (stdout) {
					outputChannel.appendLine(stdout);
				}
				if (stderr) {
					outputChannel.appendLine(stderr);
				}
			});
			vscode.window.showInformationMessage(`已开始执行 Flutter build_runner（${label}），详情见输出面板。`);
		}
	}


	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "build-runner-watch" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	function findPubspecYamlUpwards(startDir: string, workspaceDir: string): string | null {
		const path = require('path');
		const fs = require('fs');
		let dir = startDir;
		while (true) {
			const pubspecPath = path.join(dir, 'pubspec.yaml');
			if (fs.existsSync(pubspecPath)) {
				return dir;
			}
			if (dir === workspaceDir) {
				break;
			}
			const parentDir = path.dirname(dir);
			if (parentDir === dir) {
				break;
			}
			dir = parentDir;
		}
		return null;
	}

	// build-runner-watch.options：弹窗选择
	const disposable = vscode.commands.registerCommand('build-runner-watch.options', async (uri) => {
		let baseDir = uri && uri.fsPath ? uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		if (require('fs').existsSync(baseDir) && require('fs').statSync(baseDir).isFile) {
			baseDir = require('path').dirname(baseDir);
		}
		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		const cwd = findPubspecYamlUpwards(baseDir, workspaceDir) || baseDir;
		const options = [
			{ label: 'build', description: 'dart run build_runner build --delete-conflicting-outputs' },
			{ label: 'watch', description: 'dart run build_runner watch --delete-conflicting-outputs' },
			{ label: 'clean', description: 'dart run build_runner clean' }
		];
		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: '请选择 build_runner 命令参数',
		});
		if (!selected) {return;}
		let command = '';
		if (selected.label === 'build') {
			command = 'dart run build_runner build --delete-conflicting-outputs';
		} else if (selected.label === 'watch') {
			command = 'dart run build_runner watch --delete-conflicting-outputs';
		} else if (selected.label === 'clean') {
			command = 'dart run build_runner clean';
		}
		runBuildRunnerCommand(cwd, command, selected.label);
	});
	context.subscriptions.push(disposable);

	// build-runner-watch.build
	const disposableBuild = vscode.commands.registerCommand('build-runner-watch.build', async (uri) => {
		let baseDir = uri && uri.fsPath ? uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		if (require('fs').existsSync(baseDir) && require('fs').statSync(baseDir).isFile) {
			baseDir = require('path').dirname(baseDir);
		}
		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		const cwd = findPubspecYamlUpwards(baseDir, workspaceDir) || baseDir;
		runBuildRunnerCommand(cwd, 'dart run build_runner build --delete-conflicting-outputs', 'build');
	});
	context.subscriptions.push(disposableBuild);

	// build-runner-watch.watch
	const disposableWatch = vscode.commands.registerCommand('build-runner-watch.watch', async (uri) => {
		let baseDir = uri && uri.fsPath ? uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		if (require('fs').existsSync(baseDir) && require('fs').statSync(baseDir).isFile) {
			baseDir = require('path').dirname(baseDir);
		}
		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		const cwd = findPubspecYamlUpwards(baseDir, workspaceDir) || baseDir;
		runBuildRunnerCommand(cwd, 'dart run build_runner watch --delete-conflicting-outputs', 'watch');
	});
	context.subscriptions.push(disposableWatch);

	// build-runner-watch.clean
	const disposableClean = vscode.commands.registerCommand('build-runner-watch.clean', async (uri) => {
		let baseDir = uri && uri.fsPath ? uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		if (require('fs').existsSync(baseDir) && require('fs').statSync(baseDir).isFile) {
			baseDir = require('path').dirname(baseDir);
		}
		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		const cwd = findPubspecYamlUpwards(baseDir, workspaceDir) || baseDir;
		runBuildRunnerCommand(cwd, 'dart run build_runner clean', 'clean');
	});
	context.subscriptions.push(disposableClean);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
