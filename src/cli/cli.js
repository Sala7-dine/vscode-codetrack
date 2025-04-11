#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { validateArgs, formatTimestamp } = require('./utils');
const { saveFailedRequest, processFailedRequests } = require('./retryManager');

/**
 * Envoie les données de suivi à l'API
 * @param {string} filePath - Chemin du fichier modifié
 * @param {string} project - Nom du projet
 * @param {number} duration - Durée en secondes
 * @param {string} apiToken - Token d'API (optionnel)
 * @param {string} apiUrl - URL de base de l'API
 * @returns {Promise<void>}
 */
async function trackActivity(filePath, project, duration, apiToken, apiUrl = 'http://127.0.0.1:8000/api') {
    // URL complète pour l'endpoint de suivi
    const trackUrl = `${apiUrl}/track`;
    
    // Afficher des informations sur l'activité
    console.log(`=== CodeTrack - Envoi d'activité ===`);
    console.log(`Fichier: ${path.basename(filePath)}`);
    console.log(`Projet: ${project}`);
    console.log(`Durée: ${duration}s`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`API: ${trackUrl}`);
    
    // Préparer les données pour l'API
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
        file: filePath,
        project: project,
        duration: parseInt(duration, 10),
        timestamp: timestamp
    };

    // Configurer la requête
    const config = {
        headers: {}
    };

    // Ajouter le token d'API s'il est fourni
    if (apiToken) {
        config.headers['Authorization'] = `Bearer ${apiToken}`;
    }

    try {
        // Envoyer la requête à l'API
        const response = await axios.post(trackUrl, payload, config);
        console.log(`Succès: Activité enregistrée pour ${filePath} (${formatTimestamp(timestamp)})`);
        return response.data;
    } catch (error) {
        // Gérer les erreurs
        console.error(`Erreur: Impossible d'envoyer les données à l'API (${error.message})`);
        
        // Sauvegarder la requête échouée pour réessayer plus tard
        await saveFailedRequest({
            url: trackUrl,
            method: 'POST',
            data: payload,
            headers: config.headers,
            timestamp: timestamp
        });
        
        return null;
    }
}

/**
 * Fonction principale
 */
async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length < 3) {
            console.error('Usage: node cli.js <filePath> <project> <duration> [apiToken] [apiUrl]');
            process.exit(1);
        }

        const [filePath, project, duration, apiToken, apiUrl] = args;

        await trackActivity(filePath, project, duration, apiToken, apiUrl);
        await processFailedRequests(apiToken, apiUrl);
        
        process.exit(0);
    } catch (error) {
        console.error('Erreur d\'exécution:', error.message);
        process.exit(1);
    }
}

// Exécuter le script si appelé directement
if (require.main === module) {
    main();
}

// Exporter pour une utilisation programmatique
module.exports = { trackActivity };