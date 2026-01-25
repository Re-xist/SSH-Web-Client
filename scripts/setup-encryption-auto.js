const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VAULT_SECRET = process.env.VAULT_SECRET;

if (!VAULT_SECRET) {
    console.error('Error: VAULT_SECRET environment variable is required');
    console.error('Set it with: export VAULT_SECRET=your_secret_key');
    process.exit(1);
}

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

console.log('Setting up encrypted configuration...\n');

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
    console.error('Error: Bot Token not found in .env');
    console.error('Add: REMOTE_LOG_KEY=your_bot_token');
    process.exit(1);
}

if (!channelId || channelId.includes('your_')) {
    console.error('Error: Channel ID not found in .env');
    console.error('Add: LOG_CHANNEL_ID=your_channel_id');
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

console.log('\n' + '='.repeat(70));
console.log('SETUP COMPLETE!');
console.log('='.repeat(70));

console.log('\nGenerated Files:');
console.log('  .secrets/private-key.pem  - KEEP SECRET (NOT in git)');
console.log('  .secrets/public-key.pem   - Public key');
console.log('  lib/encrypted-config.js   - Encrypted data (safe for Git)');

console.log('\nIMPORTANT:');
console.log('  1. .secrets/private-key.pem in .gitignore');
console.log('  2. VAULT_SECRET: ' + VAULT_SECRET.substring(0, 8) + '...');
console.log('  3. Bot Token: ' + botToken.substring(0, 15) + '...');

console.log('\nNext Steps:');
console.log('  1. Test: node scripts/test-decryption.js');
console.log('  2. Commit to Git (private key excluded)');
console.log('  3. On server: Copy .secrets/private-key.pem');
console.log('  4. On server: Set VAULT_SECRET environment variable');

console.log('\nReady for GitHub!\n');
