const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(process.cwd(), 'data');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER || 'Anietim';
const REPO_NAME = process.env.REPO_NAME || 'grench-legal';

// Ensure /tmp/data directory exists
function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    
    // Copy initial data files from root project data folder to /tmp/data if on Vercel
    const sourceDir = path.join(process.cwd(), 'data');
    if (fs.existsSync(sourceDir)) {
      const files = fs.readdirSync(sourceDir);
      files.forEach(file => {
        const srcFile = path.join(sourceDir, file);
        const destFile = path.join(DATA_DIR, file);
        if (fs.statSync(srcFile).isFile() && !fs.existsSync(destFile)) {
          fs.copyFileSync(srcFile, destFile);
        }
      });
    }
  }
}

// Read JSON data safely
function readData(filename) {
  ensureDataDirectory();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

// Push persistent file updates to GitHub repository
async function syncToGitHub(filename, data, commitMessage) {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set. Saved to runtime /tmp storage only.');
    return;
  }

  const repoFilePath = `data/${filename}`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoFilePath}`;

  try {
    // Get existing SHA required for updates
    let sha = null;
    const getRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-App'
      }
    });

    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    // Commit file update to GitHub
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-App'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
        sha: sha || undefined
      })
    });
  } catch (err) {
    console.error('Failed to push update to GitHub:', err);
  }
}

// Save JSON data locally in /tmp and trigger async GitHub backup
async function writeData(filename, data, commitMessage = 'Update site data') {
  ensureDataDirectory();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

  // Sync to GitHub in the background
  await syncToGitHub(filename, data, commitMessage);
}

module.exports = { readData, writeData };