const fs = require('fs');
const path = require('path');

// Dossiers source et destination
const sourceDir = path.join(__dirname, '../src/cli');
const destDir = path.join(__dirname, '../out/cli');

console.log('Script de copie des fichiers CLI');
console.log(`Source: ${sourceDir}`);
console.log(`Destination: ${destDir}`);

// Vérifier si le dossier source existe
if (!fs.existsSync(sourceDir)) {
    console.error(`ERREUR: Le dossier source ${sourceDir} n'existe pas.`);
    process.exit(1);
}

// Créer le dossier de destination s'il n'existe pas
if (!fs.existsSync(destDir)) {
    try {
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`Dossier créé: ${destDir}`);
    } catch (err) {
        console.error(`ERREUR lors de la création du dossier: ${err.message}`);
        process.exit(1);
    }
}

// Copier tous les fichiers .js
try {
    const files = fs.readdirSync(sourceDir);
    console.log(`Fichiers trouvés dans le dossier source: ${files.length}`);
    
    let copiedCount = 0;
    
    files.forEach(file => {
        if (file.endsWith('.js')) {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(destDir, file);
            
            fs.copyFileSync(sourcePath, destPath);
            console.log(`Copié: ${file} vers ${destPath}`);
            copiedCount++;
        }
    });
    
    console.log(`${copiedCount} fichiers copiés avec succès!`);
} catch (err) {
    console.error(`ERREUR lors de la copie des fichiers: ${err.message}`);
    process.exit(1);
}