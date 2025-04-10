import * as vscode from 'vscode';
import { CodeTracker } from './tracker';

/**
 * Cette fonction est appelée quand l'extension est activée
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "CodeTrack" est maintenant active!');
    
    // Initialiser le tracker
    const tracker = new CodeTracker();
    
    // Enregistrer les commandes
    let showStatsCommand = vscode.commands.registerCommand('codetrack.showStats', () => {
        tracker.showStats();
    });
    
    // Ajouter nos disposables au contexte
    context.subscriptions.push(showStatsCommand);
    context.subscriptions.push(tracker);
}

/**
 * Cette fonction est appelée quand l'extension est désactivée
 */
export function deactivate() {
    console.log('Extension "CodeTrack" est maintenant désactivée.');
}