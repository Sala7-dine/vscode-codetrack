import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Interface pour les informations d'environnement
 */
export interface EnvironmentInfo {
    editor: {
        name: string;
        version: string;
    };
    system: {
        type: string;
        platform: string;
        release: string;
        architecture: string;
        username: string;
    };
}

/**
 * Obtenir les informations sur l'environnement
 */
export function getEnvironmentInfo(): EnvironmentInfo {
    return {
        editor: {
            name: 'Visual Studio Code',
            version: vscode.version
        },
        system: {
            type: os.type(),
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch(),
            username: os.userInfo().username
        }
    };
}

/**
 * Formatter les informations d'environnement en texte
 */
export function formatEnvironmentInfo(info: EnvironmentInfo): string {
    let result = 'Environnement:\n';
    result += `Éditeur: ${info.editor.name} ${info.editor.version}\n`;
    result += `Système d'exploitation: ${info.system.type} ${info.system.release} (${info.system.platform})\n`;
    result += `Architecture: ${info.system.architecture}\n`;
    result += `Utilisateur: ${info.system.username}\n`;
    
    return result;
}
