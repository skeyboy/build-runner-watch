// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// 简单 i18n 资源
	const  i18n = {
		zh: {
			noBuildRunner: 'pubspec.yaml 未检测到 build_runner 依赖（或已被注释），命令未执行。',
			buildStarted: '已开始执行 Flutter build_runner（{label}），详情见输出面板。',
			watchStarted: '已在后台启动 Flutter build_runner watch，详情见输出面板。',
			watchExited: '[watch 进程已退出，代码: {code}]',
			selectCommand: '请选择 build_runner 命令参数',
		},
		en: {
			noBuildRunner: 'No build_runner dependency found in pubspec.yaml (or it is commented out). Command not executed.',
			buildStarted: 'Flutter build_runner ({label}) started. See output panel for details.',
			watchStarted: 'Flutter build_runner watch started in background. See output panel for details.',
			watchExited: '[watch process exited, code: {code}]',
			selectCommand: 'Please select build_runner command',
		}
	};
	// 获取当前语言
	function getLang() {
		const lang = vscode.env.language;
		return lang.startsWith('zh') ? 'zh' : 'en';
	}
	type I18nKey = 'noBuildRunner' | 'buildStarted' | 'watchStarted' | 'watchExited' | 'selectCommand';
	function t(key: I18nKey, vars?: Record<string, string|number>) {
		const lang = getLang();
		let str = (i18n[lang] as Record<I18nKey, string>)[key] || key;
		if (vars) {
			Object.keys(vars).forEach(k => {
				str = str.replace(new RegExp(`\{${k}\}`, 'g'), String(vars[k]));
			});
		}
		return str;
	}

	function checkFvm(cwd: string): boolean { 
		const fvmrc = require('path').join(cwd, '.fvmrc');
		if (!require('fs').existsSync(fvmrc)) {
			return false;
		} else { 
			return true;
		}
	}

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
			vscode.window.showWarningMessage(t('noBuildRunner'));
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
				outputChannel.appendLine(t('watchExited', { code }));
			});
			vscode.window.setStatusBarMessage(t('watchStarted'), 2000);
		} else {
			// build/clean 实时输出日志
			let args: string[] = [];
			if (label === 'build') {
				args = ['run', 'build_runner', 'build', '--delete-conflicting-outputs'];
			} else if (label === 'clean') {
				args = ['run', 'build_runner', 'clean'];
			}
			const child = cp.spawn('dart', args, { cwd, shell: true });
			child.stdout.on('data', (data: Buffer) => {
				outputChannel.appendLine(data.toString());
			});
			child.stderr.on('data', (data: Buffer) => {
				outputChannel.appendLine(data.toString());
			});
			child.on('close', (code: number) => {
				outputChannel.appendLine(t('watchExited', { code }));
			});
			vscode.window.setStatusBarMessage(t('buildStarted', { label }), 2000);
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
			placeHolder: t('selectCommand'),
		});
		if (!selected) {return;}
		let command = '';
		const fvmOrNot = checkFvm(cwd) ? 'fvm dart' : 'dart';
		if (selected.label === 'build') {
			command =  ' run build_runner build --delete-conflicting-outputs';
		} else if (selected.label === 'watch') {
			command = fvmOrNot + ' run build_runner watch --delete-conflicting-outputs';
		} else if (selected.label === 'clean') {
			command = fvmOrNot + ' run build_runner clean';
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
		const fvmOrNot = checkFvm(cwd) ? 'fvm dart' : 'dart';
		runBuildRunnerCommand(cwd, fvmOrNot + ' run build_runner build --delete-conflicting-outputs', 'build');
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
		const fvmOrNot = checkFvm(cwd) ? 'fvm dart' : 'dart';
		runBuildRunnerCommand(cwd, fvmOrNot+' run build_runner watch --delete-conflicting-outputs', 'watch');
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
		const fvmOrNot = checkFvm(cwd) ? 'fvm dart' : 'dart';
		runBuildRunnerCommand(cwd, fvmOrNot + ' run build_runner clean', 'clean');
	});
	context.subscriptions.push(disposableClean);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
