const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL || process.env.RENDER
  ? path.join('/tmp', 'data')
  : path.join(process.cwd(), 'data');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER || 'Anietim';
const REPO_NAME = process.env.REPO_NAME || 'grench-legal';

// Only create directory when actually reading or writing
function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });

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

function readData(filename) {
  ensureDataDirectory();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function syncToGitHub(filename, data, commitMessage) {
  if (!GITHUB_TOKEN) return;

  const repoFilePath = `data/${filename}`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoFilePath}`;

  try {
    let sha = null;
    const getRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'GrenchLegalApp'
      }
    });

    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GrenchLegalApp'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
        sha: sha || undefined
      })
    });
  } catch (err) {
    console.error('GitHub sync error:', err);
  }
}

async function writeData(filename, data, commitMessage = 'Update site data') {
  ensureDataDirectory();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  await syncToGitHub(filename, data, commitMessage);
}

module.exports = { readData, writeData };