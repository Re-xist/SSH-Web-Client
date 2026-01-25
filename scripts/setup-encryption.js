const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VAULT_SECRET = 'Le4k5R3D3r0-2o2g';

function generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
}

function encryptAES(plaintext, secret) {
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const key = crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'binary');
    ciphertext += cipher.final('binary');
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, authTag, Buffer.from(ciphertext, 'binary')]);
    return combined.toString('base64');
}

function encryptPublic(data, publicKey) {
    const buffer = Buffer.from(data, 'utf8');
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        buffer
    );
    return encrypted.toString('base64');
}

function encryptConfigValue(value, secret, publicKey) {
    const encryptedData = encryptAES(value, secret);
    const encryptedSecret = encryptPublic(secret, publicKey);

    return {
        data: encryptedData,
        secret: encryptedSecret
    };
}

console.log('Setting up secure configuration...\n');

const envPath = path.join(__dirname, '..', '.env');
let botToken = '';
let channelId = '';

if (fs.existsSync(envPath)) {
    console.log('Reading .env file...');
    const envContent = fs.readFileSync(envPath, 'utf8');

    const tokenMatch = envContent.match(/REMOTE_LOG_KEY=([^\n]+)/) ||
                       envContent.match(/CLOUD_SYNC_TOKEN=([^\n]+)/);
    const channelMatch = envContent.match(/LOG_CHANNEL_ID=([^\n]+)/) ||
                        envContent.match(/SYNC_TARGET_ID=([^\n]+)/);

    if (tokenMatch) botToken = tokenMatch[1].trim();
    if (channelMatch) channelId = channelMatch[1].trim();
}

if (!botToken || botToken.includes('your_')) {
    console.log('\nBot Token not found in .env');
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    botToken = await new Promise(resolve => {
        rl.question('Enter Bot Token: ', answer => {
            resolve(answer);
        });
    });
    rl.close();
}

if (!channelId || channelId.includes('your_')) {
    console.log('\nChannel ID not found in .env');
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    channelId = await new Promise(resolve => {
        rl.question('Enter Channel ID: ', answer => {
            resolve(answer);
        });
    });
    rl.close();
}

if (!botToken || !channelId) {
    console.error('\nError: Bot Token and Channel ID are required!');
    process.exit(1);
}

console.log('\nGenerating RSA key pair...');
const { publicKey, privateKey } = generateKeyPair();
console.log('RSA key pair generated');

console.log('\nEncrypting configuration...');

const encryptedToken = encryptConfigValue(botToken, VAULT_SECRET, publicKey);
const encryptedChannel = encryptConfigValue(channelId, VAULT_SECRET, publicKey);

console.log('Configuration encrypted');

const secretsDir = path.join(__dirname, '..', '.secrets');
if (!fs.existsSync(secretsDir)) {
    fs.mkdirSync(secretsDir, { mode: 0o700 });
}

const privateKeyPath = path.join(secretsDir, 'private-key.pem');
fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
console.log(`\nPrivate key saved to: .secrets/private-key.pem`);

const publicKeyPath = path.join(secretsDir, 'public-key.pem');
fs.writeFileSync(publicKeyPath, publicKey);
console.log(`Public key saved to: .secrets/public-key.pem`);

console.log('\nCreating encrypted configuration module...');

const configModule = `module.exports = {
    publicKey: ${JSON.stringify(publicKey)},
    token: {
        data: '${encryptedToken.data}',
        secret: '${encryptedToken.secret}'
    },
    channel: {
        data: '${encryptedChannel.data}',
        secret: '${encryptedChannel.secret}'
    }
};
`;

const configPath = path.join(__dirname, '..', 'lib', 'encrypted-config.js');
fs.writeFileSync(configPath, configModule);
console.log(`Encrypted config saved to: lib/encrypted-config.js`);

console.log('\nUpdating .gitignore...');
const gitignorePath = path.join(__dirname, '..', '.gitignore');
let gitignore = '';

if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf8');
}

if (!gitignore.includes('.secrets/')) {
    gitignore += '\n# Secrets\n.secrets/\n.secrets/*\n*.dist.js\n\n!.secrets/public-key.pem\n';
    fs.writeFileSync(gitignorePath, gitignore);
    console.log('.gitignore updated');
} else {
    console.log('.gitignore already configured');
}

console.log('\nUpdating .env.example...');

const envExamplePath = path.join(__dirname, '..', '.env.example');
const envExample = `# Application Configuration

# Master secret for configuration decryption
VAULT_SECRET=${VAULT_SECRET}

# Server Configuration
PORT=2211
NODE_ENV=production
DEBUG=false
`;

fs.writeFileSync(envExamplePath, envExample);
console.log('.env.example updated');

const secretsReadme = `# Secrets Directory

Private key for configuration decryption.

## Files

- \`private-key.pem\` - Private key (NEVER commit)
- \`public-key.pem\` - Public key (safe)

## Decryption Example

\`\`\`javascript
const crypto = require('./lib/crypto-vault');
const config = require('./lib/encrypted-config');

const token = crypto.decryptData(
    config.token.data,
    config.token.secret,
    privateKey
);
\`\`\`
`;

const readmePath = path.join(secretsDir, 'README.md');
fs.writeFileSync(readmePath, secretsReadme);
console.log('Created .secrets/README.md');

console.log('\n' + '='.repeat(70));
console.log('SETUP COMPLETE!');
console.log('='.repeat(70));

console.log('\nGenerated Files:');
console.log('  .secrets/private-key.pem  - KEEP SECRET');
console.log('  .secrets/public-key.pem   - Safe to share');
console.log('  lib/encrypted-config.js   - Encrypted data (safe for Git)');

console.log('\nIMPORTANT:');
console.log('  1. .secrets/private-key.pem is in .gitignore');
console.log('  2. Back up your private key!');
console.log('  3. Test: node scripts/test-decryption.js');

console.log('\nNext Steps:');
console.log('  1. Test: node scripts/test-decryption.js');
console.log('  2. Commit to Git (private key excluded)');
console.log('  3. On server: Copy .secrets/private-key.pem');
console.log('  4. On server: Set VAULT_SECRET environment variable');

console.log('\nReady for GitHub!\n');
