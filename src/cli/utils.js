/**
 * Utilitaires pour le CLI CodeTrack
 */

const fs = require('fs');
const path = require('path');

/**
 * Valide les arguments passés au CLI
 * @param {string[]} args - Arguments de ligne de commande
 * @returns {boolean} - Vrai si les arguments sont valides
 */
function validateArgs(args) {
    // Au minimum, nous avons besoin du chemin du fichier, du projet et de la durée
    if (args.length < 3) {
        return false;
    }

    const [filePath, project, duration] = args;

    // Vérifier que tous les arguments requis sont présents
    if (!filePath || !project || !duration) {
        return false;
    }

    // Vérifier que la durée est un nombre valide
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0) {
        return false;
    }

    return true;
}

/**
 * Formate un timestamp UNIX en date lisible
 * @param {number} timestamp - Timestamp UNIX
 * @returns {string} - Date formatée
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toISOString();
}

/**
 * Crée un répertoire récursivement s'il n'existe pas
 * @param {string} dirPath - Chemin du répertoire à créer
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Lit un fichier JSON, retourne un objet vide si le fichier n'existe pas
 * @param {string} filePath - Chemin du fichier à lire
 * @returns {Object} - Contenu du fichier JSON parsé
 */
function readJsonFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.error(`Erreur lors de la lecture du fichier ${filePath}:`, error.message);
    }
    return {};
}

/**
 * Écrit des données dans un fichier JSON
 * @param {string} filePath - Chemin du fichier à écrire
 * @param {Object} data - Données à écrire
 */
function writeJsonFile(filePath, data) {
    try {
        const dirPath = path.dirname(filePath);
        ensureDirectoryExists(dirPath);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Erreur lors de l'écriture du fichier ${filePath}:`, error.message);
    }
}

module.exports = {
    validateArgs,
    formatTimestamp,
    ensureDirectoryExists,
    readJsonFile,
    writeJsonFile
};