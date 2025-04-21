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
 * @param {Object} stats - Statistiques complètes (optionnel)
 * @param {boolean} isActive - Indique si l'utilisateur est actif (optionnel)
 * @param {boolean} isCurrentProject - Indique si c'est le projet actuel (optionnel)
 * @param {string} apiKey - Clé API utilisateur (optionnel)
 * @returns {Promise<void>}
 */
async function trackActivity(filePath, project, duration, apiToken, apiUrl = 'http://127.0.0.1:8000/api', stats = null, isActive = true, isCurrentProject = true, apiKey = null) {
    // Ne pas envoyer de données si l'utilisateur est inactif
    if (!isActive) {
        console.log(`Utilisateur inactif, pas d'envoi de données pour ${path.basename(filePath)}`);
        return null;
    }
    
    // URL complète pour l'endpoint de suivi
    const trackUrl = `${apiUrl}/track`;
    
    // Afficher des informations sur l'activité
    console.log(`=== CodeTrack - Envoi d'activité ===`);
    console.log(`Fichier: ${path.basename(filePath)}`);
    console.log(`Projet: ${project}`);
    console.log(`Projet actuel: ${isCurrentProject ? 'Oui' : 'Non'}`);
    console.log(`Durée: ${duration}s`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`API: ${trackUrl}`);
    
    // Préparer les données pour l'API
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
        file: filePath,
        project: project,
        duration: parseInt(duration, 10),
        timestamp: timestamp,
        isActive: isActive,
        isCurrentProject: isCurrentProject,
        lastActiveTime: Date.now()
    };

    // Ajouter les statistiques complètes si elles sont fournies
    if (stats) {
        payload.stats = stats;
        console.log(`Statistiques complètes incluses dans l'envoi`);
    }

    try {
        // Configuration de la requête
        const config = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // Ajouter le token d'API si fourni
        if (apiToken) {
            config.headers['Authorization'] = `Bearer ${apiToken}`;
        }
        
        // Ajouter l'API key si fournie
        if (apiKey) {
            config.headers['X-API-KEY'] = apiKey;
            console.log(`En-tête X-API-KEY ajouté à la requête`);
        }

        // Afficher le payload pour le débogage
        console.log('Envoi des données:', JSON.stringify(payload, null, 2).substring(0, 500) + '...');
        
        // Effectuer la requête à l'API
        console.log(`Envoi de données à ${trackUrl}...`);
        const response = await axios.post(trackUrl, payload, config);
        
        // Afficher la réponse
        console.log(`Réponse de l'API: ${response.status}`);
        console.log(JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        console.error('Erreur lors de l\'envoi à l\'API:', error.message);
        
        if (error.response) {
            // La requête a été faite et le serveur a répondu avec un code d'état
            console.error('Réponse d\'erreur:', error.response.status);
            console.error('Données d\'erreur:', error.response.data);
        } else if (error.request) {
            // La requête a été faite mais aucune réponse n'a été reçue
            console.error('Aucune réponse reçue du serveur');
        }
        
        // Sauvegarde de la requête pour réessai ultérieur
        await saveFailedRequest({
            url: trackUrl,
            method: 'POST',
            data: payload,
            headers: config.headers,
            timestamp: timestamp
        });
        
        throw error;
    }
}

/**
 * Fonction principale
 */
async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length < 3) {
            console.error('Usage: node cli.js <filePath> <project> <duration> [apiToken] [apiUrl] [statsFile] [isActive] [isCurrentProject] [apiKey]');
            process.exit(1);
        }

        const [filePath, project, duration, apiToken, apiUrl, statsFile, isActiveStr, isCurrentProjectStr, apiKey] = args;
        
        // Déterminer si l'utilisateur est actif (true par défaut)
        const isActive = isActiveStr ? isActiveStr.toLowerCase() === 'true' : true;
        
        // Déterminer s'il s'agit du projet actuel (true par défaut)
        let isCurrentProject = true;
        if (isCurrentProjectStr) {
            if (isCurrentProjectStr === 'currentProject=false') {
                isCurrentProject = false;
            } else if (isCurrentProjectStr === 'currentProject=true') {
                isCurrentProject = true;
            } else {
                isCurrentProject = isCurrentProjectStr.toLowerCase() === 'true';
            }
        }
        
        // Charger les statistiques complètes si un fichier est spécifié
        let stats = null;
        if (statsFile && fs.existsSync(statsFile)) {
            try {
                console.log(`Tentative de lecture du fichier: ${statsFile}`);
                const statsData = fs.readFileSync(statsFile, 'utf8');
                stats = JSON.parse(statsData);
                
                // Marquer explicitement le projet comme actuel dans les statistiques
                stats.isCurrentProject = isCurrentProject;
                stats.lastActiveTime = Date.now();
                
                console.log(`Statistiques chargées depuis ${statsFile}`);
            } catch (err) {
                console.error(`Erreur lors du chargement des statistiques: ${err.message}`);
            }
        }

        // Passer tous les paramètres à la fonction trackActivity, y compris l'API key
        await trackActivity(filePath, project, duration, apiToken, apiUrl, stats, isActive, isCurrentProject, apiKey);
        
        // Également passer l'API key pour les requêtes échouées
        if (isActive) {
            await processFailedRequests(apiToken, apiUrl, apiKey);
        }
        
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