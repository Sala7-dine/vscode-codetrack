import * as vscode from 'vscode';
import { CodeTracker } from './tracker';

/**
 * Cette fonction est appelée quand l'extension est activée
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "CodeTrack" est maintenant active!');
    
    // Créer une instance du tracker en passant le contexte
    const tracker = new CodeTracker(context);
    
    // Enregistrer le tracker dans les disposables du contexte
    context.subscriptions.push(tracker);
    
    // Enregistrer les commandes
    let showStatsCommand = vscode.commands.registerCommand('codetrack.showStats', () => {
        tracker.showStats();
    });
    
    context.subscriptions.push(
        vscode.commands.registerCommand('codetrack.setApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                placeHolder: 'Entrez votre clé API',
                prompt: 'Cette clé sera utilisée pour authentifier vos requêtes auprès du serveur',
                password: true // Masquer l'entrée pour la sécurité
            });
            
            if (apiKey) {
                tracker.setApiKey(apiKey);
                vscode.window.showInformationMessage(`Clé API définie avec succès`);
            }
        })
    );
    
    // Ajouter nos disposables au contexte
    context.subscriptions.push(showStatsCommand);
}

/**
 * Cette fonction est appelée quand l'extension est désactivée
 */
export function deactivate() {
    console.log('Extension "CodeTrack" est maintenant désactivée.');
}