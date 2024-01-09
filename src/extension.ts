import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "gptdoc" is now active!');

    const sidebarProvider = new SidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('gptdoc-sidebar', sidebarProvider),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gptdoc.refresh', async () => {
            await vscode.commands.executeCommand('workbench.action.closeSidebar');
            await vscode.commands.executeCommand('workbench.view.extension.gptdoc-sidebar-view');

            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
            }, 500);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gptdoc.helloWorld', () => {
            vscode.window.showInformationMessage('Hello World from gptdoc!');
        }),
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
