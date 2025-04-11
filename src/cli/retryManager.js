/**
 * Gestionnaire de réessais pour les requêtes échouées
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { readJsonFile, writeJsonFile } = require('./utils');

// Chemin du fichier de logs pour les requêtes échouées
const LOGS_FILE = path.join(__dirname, 'logs.json');

// Ajouter une fonction d'attente
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Réessaye une requête avec backoff exponentiel
 * @param {Function} requestFn - Fonction qui effectue la requête
 * @param {number} maxRetries - Nombre maximum de tentatives
 * @param {number} initialDelay - Délai initial en ms
 */
async function retryWithBackoff(requestFn, maxRetries = 3, initialDelay = 1000) {
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            console.log(`Tentative ${attempt} échouée, nouvel essai dans ${delay}ms...`);
            await sleep(delay);
            delay *= 2; // Backoff exponentiel
        }
    }
}

/**
 * Sauvegarde une requête échouée pour réessayer plus tard
 * @param {Object} request - Informations sur la requête échouée
 * @returns {Promise<void>}
 */
async function saveFailedRequest(request) {
    try {
        // Lire les logs existants ou initialiser un tableau vide
        let logs = [];
        
        if (fs.existsSync(LOGS_FILE)) {
            logs = readJsonFile(LOGS_FILE);
            if (!Array.isArray(logs)) {
                logs = [];
            }
        }
        
        // Ajouter la nouvelle requête échouée
        logs.push({
            ...request,
            failedAt: Date.now()
        });
        
        // Sauvegarder les logs mis à jour
        writeJsonFile(LOGS_FILE, logs);
        
        console.log(`Requête sauvegardée dans ${LOGS_FILE} pour réessai ultérieur`);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la requête échouée:', error.message);
    }
}

/**
 * Traite les requêtes échouées précédemment
 * @param {string} apiToken - Token d'API à utiliser pour les requêtes
 * @param {string} apiUrl - URL de base de l'API
 * @returns {Promise<void>}
 */
async function processFailedRequests(apiToken, apiUrl = 'http://127.0.0.1:8000/api') {
    if (!fs.existsSync(LOGS_FILE)) {
        return;
    }
    
    try {
        // Lire les logs existants
        const logs = readJsonFile(LOGS_FILE);
        if (!Array.isArray(logs) || logs.length === 0) {
            return;
        }
        
        console.log(`Traitement de ${logs.length} requêtes échouées...`);
        
        // Garder la trace des requêtes toujours en échec
        const stillFailing = [];
        
        // Essayer chaque requête échouée
        for (const request of logs) {
            try {
                // Mettre à jour le token d'API si fourni
                if (apiToken && request.headers) {
                    request.headers['Authorization'] = `Bearer ${apiToken}`;
                }
                
                // Mettre à jour l'URL si elle a changé
                let url = request.url;
                if (apiUrl && url.startsWith('http')) {
                    // Extraire le chemin relatif de l'URL d'origine
                    const urlParts = new URL(url);
                    const pathPart = urlParts.pathname.split('/api/')[1];
                    
                    // Construire la nouvelle URL
                    url = `${apiUrl}/${pathPart}`;
                }
                
                // Envoyer la requête
                await axios({
                    method: request.method || 'POST',
                    url: url,
                    data: request.data,
                    headers: request.headers || {}
                });
                
                console.log(`Requête réessayée avec succès: ${request.data.file}`);
            } catch (error) {
                console.error(`Échec du réessai pour ${request.data.file}:`, error.message);
                stillFailing.push(request);
            }
        }
        
        // Mettre à jour le fichier de logs avec les requêtes toujours en échec
        writeJsonFile(LOGS_FILE, stillFailing);
        
        console.log(`${logs.length - stillFailing.length} requêtes traitées avec succès, ${stillFailing.length} toujours en échec`);
    } catch (error) {
        console.error('Erreur lors du traitement des requêtes échouées:', error.message);
    }
}

module.exports = {
    saveFailedRequest,
    processFailedRequests,
    retryWithBackoff
};