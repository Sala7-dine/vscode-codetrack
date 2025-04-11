import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getEnvironmentInfo, formatEnvironmentInfo } from './environment';
import { exec } from 'child_process';
import { promisify } from 'util';

/**
 * Interface pour les statistiques de fichier
 */
interface FileStats {
    filePath: string;
    language: string;
    lineCount: number;
    timeSpent: number;
    lastActiveTime: number;
}

/**
 * Classe principale pour suivre le temps et les statistiques des fichiers
 */
export class CodeTracker implements vscode.Disposable {
    private fileStats: Map<string, FileStats> = new Map();
    private currentFile: string | undefined;
    private lastSaveTime: number = Date.now();
    private readonly STATS_FILE: string;
    private readonly UPDATE_INTERVAL: number = 1000; // 1 seconde
    private disposables: vscode.Disposable[] = [];
    private intervalId: NodeJS.Timeout;
    private currentWorkspacePath: string | undefined;
    private outputChannel: vscode.OutputChannel;
    private lastTrackTime: number = 0; // Ajouter cette propriété à la classe

    constructor() {
        // Définir le chemin du fichier de statistiques
        this.STATS_FILE = path.join(__dirname, '../stats.json');
        
        // Créer un canal de sortie dédié
        this.outputChannel = vscode.window.createOutputChannel('CodeTrack');
        this.outputChannel.appendLine('Extension CodeTrack initialisée');
        this.outputChannel.appendLine(`Workspace actuel: ${this.getProjectName()}`);

        // Charger les statistiques existantes
        this.loadStats();
        
        // Configurer les écouteurs d'événements
        this.setupEventListeners();
        
        // Configurer l'intervalle de mise à jour
        this.intervalId = setInterval(() => this.updateCurrentFileTime(), this.UPDATE_INTERVAL);
        
        // Déterminer le workspace actuel
        this.updateCurrentWorkspace();
    }

    /**
     * Met à jour le chemin du workspace actuel
     */
    private updateCurrentWorkspace(): void {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.currentWorkspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            this.currentWorkspacePath = undefined;
        }
    }

    /**
     * Vérifie si un fichier appartient au workspace actuel
     */
    private isFileInCurrentWorkspace(filePath: string): boolean {
        if (!this.currentWorkspacePath) {
            return false;
        }
        return filePath.startsWith(this.currentWorkspacePath);
    }

    /**
     * Retourne le nom du projet (dossier du workspace)
     */
    private getProjectName(): string {
        if (!this.currentWorkspacePath) {
            return "Pas de projet ouvert";
        }
        return path.basename(this.currentWorkspacePath);
    }

    /**
     * Configurer tous les écouteurs d'événements
     */
    private setupEventListeners(): void {
        // Suivre le changement d'éditeur actif
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.handleEditorChange(editor);
            })
        );

        // Suivre les modifications de documents
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                this.handleDocumentChange(event.document);
            })
        );

        // Suivre la fermeture des documents
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(document => {
                this.handleDocumentClose(document);
            })
        );

        // Suivre les changements de workspace
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.updateCurrentWorkspace();
            })
        );

        // Vérifier l'éditeur actif lors de l'initialisation
        if (vscode.window.activeTextEditor) {
            this.handleEditorChange(vscode.window.activeTextEditor);
        }
    }

    /**
     * Gérer le changement d'éditeur actif
     */
    private handleEditorChange(editor: vscode.TextEditor | undefined): void {
        try {
            // Mettre à jour le temps du fichier précédent
            this.updateCurrentFileTime();

            // Si pas d'éditeur, ne rien faire de plus
            if (!editor) {
                this.currentFile = undefined;
                return;
            }

            const document = editor.document;
            const filePath = document.uri.fsPath;
            
            // Mise à jour du fichier courant
            this.currentFile = filePath;
            
            // Vérifier si nous avons déjà des stats pour ce fichier
            if (!this.fileStats.has(filePath)) {
                this.fileStats.set(filePath, {
                    filePath,
                    language: document.languageId,
                    lineCount: document.lineCount,
                    timeSpent: 0,
                    lastActiveTime: Date.now()
                });
            } else {
                // Mettre à jour les statistiques existantes
                const stats = this.fileStats.get(filePath)!;
                stats.lineCount = document.lineCount;
                stats.lastActiveTime = Date.now();
                this.fileStats.set(filePath, stats);
            }
            
            // Afficher des informations dans la console pour le débogage
            this.logCurrentFileInfo();
        } catch (error) {
            console.error('Erreur lors du changement d\'éditeur :', error);
        }
    }

    /**
     * Gérer les modifications de document
     */
    private handleDocumentChange(document: vscode.TextDocument): void {
        try {
            const filePath = document.uri.fsPath;
            
            // Vérifier si nous suivons déjà ce fichier
            if (this.fileStats.has(filePath)) {
                const stats = this.fileStats.get(filePath)!;
                stats.lineCount = document.lineCount;
                this.fileStats.set(filePath, stats);
                
                // Sauvegarder périodiquement (pas à chaque changement pour éviter trop d'I/O)
                const now = Date.now();
                if (now - this.lastSaveTime > 5000) { // 5 secondes
                    this.saveStats();
                    this.lastSaveTime = now;
                }
            }
        } catch (error) {
            console.error('Erreur lors de la modification de document :', error);
        }
    }

    /**
     * Gérer la fermeture de document
     */
    private handleDocumentClose(document: vscode.TextDocument): void {
        try {
            const filePath = document.uri.fsPath;
            
            // Si c'est le fichier courant, mettre à jour son temps
            if (this.currentFile === filePath) {
                this.updateCurrentFileTime();
                this.currentFile = undefined;
            }
            
            // Sauvegarder les statistiques
            this.saveStats();
        } catch (error) {
            console.error('Erreur lors de la fermeture de document :', error);
        }
    }

    /**
     * Envoie les données de suivi à l'API via le CLI
     */
    private async trackFileActivity(filePath: string, duration: number): Promise<void> {
        try {
            // Utiliser this.outputChannel qui est déjà défini dans le constructeur
            this.outputChannel.appendLine(`Début du suivi d'activité...`);
            
            // Chemins vers le CLI
            let cliPath = path.join(__dirname, 'cli', 'cli.js');
            
            // Vérifier si le CLI existe et utiliser un chemin alternatif si nécessaire
            if (!fs.existsSync(cliPath)) {
                this.outputChannel.appendLine(`CLI non trouvé à ${cliPath}, recherche d'alternatives...`);
                
                // Chemins alternatifs possibles
                const alternatives = [
                    path.join(__dirname, '../src/cli/cli.js'),
                    path.resolve(__dirname, '..', 'cli', 'cli.js')
                ];
                
                for (const alt of alternatives) {
                    if (fs.existsSync(alt)) {
                        cliPath = alt;
                        this.outputChannel.appendLine(`CLI trouvé à ${cliPath}`);
                        break;
                    }
                }
                
                if (!fs.existsSync(cliPath)) {
                    // Si toujours pas trouvé, lister les fichiers dans le dossier parent
                    const parentDir = path.resolve(__dirname, '..');
                    this.outputChannel.appendLine(`CLI introuvable. Contenu de ${parentDir}:`);
                    
                    if (fs.existsSync(parentDir)) {
                        fs.readdirSync(parentDir).forEach(file => {
                            this.outputChannel.appendLine(`  - ${file}`);
                        });
                    } else {
                        this.outputChannel.appendLine(`  Le dossier parent n'existe pas`);
                    }
                    
                    throw new Error(`CLI introuvable dans les chemins connus`);
                }
            }
            
            // Informations projet et API
            const projectName = this.getProjectName();
            const config = vscode.workspace.getConfiguration('codetrack');
            const apiToken = config.get<string>('apiToken') || '';
            const apiUrl = config.get<string>('apiUrl') || 'http://localhost:8000/api';
            
            this.outputChannel.appendLine(`Données à envoyer:`);
            this.outputChannel.appendLine(`  Fichier: ${filePath}`);
            this.outputChannel.appendLine(`  Projet: ${projectName}`);
            this.outputChannel.appendLine(`  Durée: ${Math.floor(duration / 1000)}s`);
            this.outputChannel.appendLine(`  API URL: ${apiUrl}`);
            
            // Utiliser spawn pour un meilleur contrôle et visibilité
            const { spawn } = require('child_process');
            const nodePath = process.execPath; // Chemin de l'exécutable Node.js
            
            const args = [
                cliPath,
                filePath,
                projectName,
                Math.floor(duration / 1000).toString(),
                apiToken,
                apiUrl
            ];
            
            this.outputChannel.appendLine(`Exécution: ${nodePath} ${cliPath}`);
            
            // Créer le processus
            const child = spawn(nodePath, args);
            
            // Gérer la sortie
            child.stdout.on('data', (data: Buffer) => {
                data.toString().split('\n').forEach((line: string) => {
                    if (line.trim()) {
                        this.outputChannel.appendLine(`  CLI: ${line.trim()}`);
                    }
                });
            });
            
            // Gérer les erreurs
            child.stderr.on('data', (data: Buffer) => {
                data.toString().split('\n').forEach((line: string) => {
                    if (line.trim()) {
                        this.outputChannel.appendLine(`  Erreur CLI: ${line.trim()}`);
                    }
                });
            });
            
            // Attendre la fin du processus
            return new Promise((resolve, reject) => {
                child.on('close', (code: number) => {
                    if (code === 0) {
                        this.outputChannel.appendLine(`  Terminé avec succès (code ${code})`);
                        resolve();
                    } else {
                        this.outputChannel.appendLine(`  Terminé avec erreur (code ${code})`);
                        reject(new Error(`Processus terminé avec code ${code}`));
                    }
                });
                
                child.on('error', (err: Error) => {
                    this.outputChannel.appendLine(`  Erreur de processus: ${err.message}`);
                    reject(err);
                });
            });
            
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`Erreur lors du suivi d'activité: ${errorMessage}`);
            
            if (error instanceof Error && error.stack) {
                this.outputChannel.appendLine(`Stack: ${error.stack}`);
            }
            throw error;
        }
    }

    /**
     * Mettre à jour le temps passé sur le fichier courant
     */
    private updateCurrentFileTime(): void {
        try {
            if (this.currentFile && this.fileStats.has(this.currentFile)) {
                const stats = this.fileStats.get(this.currentFile)!;
                const now = Date.now();
                const elapsed = now - stats.lastActiveTime;
                
                // Mettre à jour le temps passé et le dernier temps actif
                stats.timeSpent += elapsed;
                stats.lastActiveTime = now;
                this.fileStats.set(this.currentFile, stats);
                
                // Envoyer les données d'activité à l'API toutes les 5 secondes
                // basé sur le temps écoulé depuis le dernier envoi, pas l'activité
                if (now - this.lastTrackTime > 5000) { // 5 secondes
                    this.lastTrackTime = now;
                    
                    this.log(`Activité détectée: ${path.basename(stats.filePath)}`);
                    this.log(`  Temps écoulé depuis dernier envoi: ${this.formatTime(now - this.lastTrackTime)}`);
                    this.log(`  Envoi à l'API...`);
                    
                    // Envoyer les données
                    this.trackFileActivity(stats.filePath, 5000) // Toujours 5 secondes pour simplifier
                        .then(() => {
                            this.log(`  ✓ Données envoyées avec succès`);
                        })
                        .catch(error => {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this.log(`  ✗ Erreur lors de l'envoi: ${errorMessage}`);
                        });
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`Erreur: ${errorMessage}`);
        }
    }

    /**
     * Log dans le terminal dédié
     */
    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Afficher les informations du fichier courant dans la console
     */
    private logCurrentFileInfo(): void {
        if (this.currentFile && this.fileStats.has(this.currentFile)) {
            const stats = this.fileStats.get(this.currentFile)!;
            console.log(`Fichier actif: ${stats.filePath}`);
            console.log(`Langage: ${stats.language}`);
            console.log(`Nombre de lignes: ${stats.lineCount}`);
            console.log(`Temps passé: ${this.formatTime(stats.timeSpent)}`);
        }
    }

    /**
     * Charger les statistiques depuis le fichier
     */
    private loadStats(): void {
        try {
            if (fs.existsSync(this.STATS_FILE)) {
                const data = fs.readFileSync(this.STATS_FILE, 'utf8');
                const statsArray = JSON.parse(data);
                
                // Convertir le tableau en Map
                for (const stats of statsArray) {
                    this.fileStats.set(stats.filePath, stats);
                }
                
                console.log(`Statistiques chargées pour ${this.fileStats.size} fichiers`);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des statistiques :', error);
        }
    }

    /**
     * Sauvegarder les statistiques dans le fichier
     */
    private saveStats(): void {
        try {
            // Convertir la Map en tableau pour JSON
            const statsArray = Array.from(this.fileStats.values());
            fs.writeFileSync(this.STATS_FILE, JSON.stringify(statsArray, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des statistiques :', error);
        }
    }

    /**
     * Formatter le temps en une chaîne lisible
     */
    private formatTime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }

    /**
     * Afficher les statistiques (appelé par la commande)
     */
    public showStats(): void {
        try {
            // Mettre à jour le temps du fichier courant
            this.updateCurrentFileTime();
            
            // Mettre à jour le workspace courant
            this.updateCurrentWorkspace();
            
            // Préparer le message
            let message = 'Statistiques de CodeTrack:\n\n';
            
            // Ajouter le nom du projet
            message += `Projet: ${this.getProjectName()}\n\n`;
            
            // Ajouter les informations sur l'environnement
            const envInfo = getEnvironmentInfo();
            message += formatEnvironmentInfo(envInfo) + '\n';
            
            // Filtrer les statistiques pour le workspace actuel
            const workspaceStats = new Map<string, FileStats>();
            
            this.fileStats.forEach((stats, filePath) => {
                if (this.isFileInCurrentWorkspace(filePath)) {
                    workspaceStats.set(filePath, stats);
                }
            });
            
            // Informations sur le fichier courant (s'il est dans le workspace actuel)
            if (this.currentFile && workspaceStats.has(this.currentFile)) {
                const stats = workspaceStats.get(this.currentFile)!;
                message += `Fichier actuel: ${path.basename(stats.filePath)}\n`;
                message += `Chemin: ${stats.filePath}\n`;
                message += `Langage: ${stats.language}\n`;
                message += `Lignes: ${stats.lineCount}\n`;
                message += `Temps passé: ${this.formatTime(stats.timeSpent)}\n\n`;
            }
            
            // Statistiques par langage pour le workspace actuel
            const langStats: { [key: string]: { files: number, lines: number, time: number } } = {};
            
            workspaceStats.forEach(stats => {
                if (!langStats[stats.language]) {
                    langStats[stats.language] = { files: 0, lines: 0, time: 0 };
                }
                langStats[stats.language].files++;
                langStats[stats.language].lines += stats.lineCount;
                langStats[stats.language].time += stats.timeSpent;
            });
            
            message += 'Par langage:\n';
            for (const lang in langStats) {
                message += `${lang}:\n`;
                message += `  Fichiers: ${langStats[lang].files}\n`;
                message += `  Lignes totales: ${langStats[lang].lines}\n`;
                message += `  Temps total: ${this.formatTime(langStats[lang].time)}\n`;
            }
            
            // Totaux pour le workspace actuel
            let totalFiles = workspaceStats.size;
            let totalLines = 0;
            let totalTime = 0;
            
            workspaceStats.forEach(stats => {
                totalLines += stats.lineCount;
                totalTime += stats.timeSpent;
            });
            
            message += `\nTotaux pour ce projet:\n`;
            message += `Fichiers: ${totalFiles}\n`;
            message += `Lignes: ${totalLines}\n`;
            message += `Temps: ${this.formatTime(totalTime)}`;
            
            // Afficher le message
            vscode.window.showInformationMessage(message);
            
            // Aussi dans la console
            console.log(message);
        } catch (error) {
            console.error('Erreur lors de l\'affichage des statistiques :', error);
            vscode.window.showErrorMessage('Erreur lors de l\'affichage des statistiques.');
        }
    }

    /**
     * Nettoyer les ressources lors de la désactivation
     */
    public dispose(): void {
        try {
            // Arrêter l'intervalle
            clearInterval(this.intervalId);
            
            // Mettre à jour une dernière fois
            this.updateCurrentFileTime();
            
            // Sauvegarder les statistiques
            this.saveStats();
            
            // Disposer tous les écouteurs d'événements
            this.disposables.forEach(disposable => disposable.dispose());
            this.disposables = [];
        } catch (error) {
            console.error('Erreur lors de la désactivation du tracker :', error);
        }
    }
}
