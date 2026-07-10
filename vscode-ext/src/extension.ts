import * as vscode from 'vscode';

const SERVER_URL = 'http://localhost:3100';

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${SERVER_URL}/api/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const result = await response.json() as { content: Array<{ type: string; text: string }> };
  return result.content.map((c: { type: string; text: string }) => c.text).join('\n');
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Extension] Encrypted Crew Bridge activated — Built by XenozExe');

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.listProjects', async () => {
      const output = await callTool('list_projects', {});
      vscode.window.showInformationMessage(`[Crew Bridge by XenozExe] Projects:\n${output}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.readFile', async () => {
      const project = await vscode.window.showInputBox({ prompt: 'Project name' });
      if (!project) return;
      const filePath = await vscode.window.showInputBox({ prompt: 'File path relative to project' });
      if (!filePath) return;
      const output = await callTool('read_file', { project, filePath });
      const doc = await vscode.workspace.openTextDocument({ content: output });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.writeFile', async () => {
      const project = await vscode.window.showInputBox({ prompt: 'Project name' });
      if (!project) return;
      const filePath = await vscode.window.showInputBox({ prompt: 'File path relative to project' });
      if (!filePath) return;
      const content = await vscode.window.showInputBox({ prompt: 'Content to encrypt and write' });
      if (!content) return;
      const output = await callTool('write_file', { project, filePath, content });
      vscode.window.showInformationMessage(output);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.deleteFile', async () => {
      const project = await vscode.window.showInputBox({ prompt: 'Project name' });
      if (!project) return;
      const filePath = await vscode.window.showInputBox({ prompt: 'File path relative to project' });
      if (!filePath) return;
      const output = await callTool('delete_file', { project, filePath });
      vscode.window.showInformationMessage(output);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.exportFile', async () => {
      const project = await vscode.window.showInputBox({ prompt: 'Project name' });
      if (!project) return;
      const filePath = await vscode.window.showInputBox({ prompt: 'Encrypted file path relative to project' });
      if (!filePath) return;
      const destination = await vscode.window.showInputBox({ prompt: 'Export destination path' });
      if (!destination) return;
      const output = await callTool('export_file', { project, filePath, destination });
      vscode.window.showInformationMessage(output);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('crewBridge.encryptText', async () => {
      const text = await vscode.window.showInputBox({ prompt: 'Text to encrypt' });
      if (!text) return;
      const output = await callTool('encrypt_text', { text });
      vscode.window.showInformationMessage(`Encrypted:\n${output}`);
    }),
  );
}

export function deactivate(): void {
  // cleanup
}
