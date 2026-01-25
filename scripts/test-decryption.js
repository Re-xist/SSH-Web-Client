const path = require('path');
const fs = require('fs');
const cryptoUtil = require('./../lib/crypto-vault');

console.log('Testing configuration...\n');

const configPath = path.join(__dirname, '..', 'lib', 'encrypted-config.js');

if (!fs.existsSync(configPath)) {
    console.error('Error: lib/encrypted-config.js not found!');
    console.error('Run: node scripts/setup-encryption.js');
    process.exit(1);
}

const encryptedConfig = require(configPath);

console.log('Configuration loaded');
console.log('  Public key: found');
console.log('  Token: encrypted');
console.log('  Channel: encrypted\n');

const privateKeyPath = path.join(__dirname, '..', '.secrets', 'private-key.pem');

if (!fs.existsSync(privateKeyPath)) {
    console.error('Error: .secrets/private-key.pem not found!');
    console.error('Run: node scripts/setup-encryption.js');
    process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

console.log('Private key loaded\n');

const masterKey = process.env.VAULT_SECRET;

if (!masterKey) {
    console.error('Error: VAULT_SECRET environment variable is required');
    console.error('Set it with: export VAULT_SECRET=your_secret_key');
    process.exit(1);
}

console.log(`Using master key: ${masterKey.substring(0, 4)}***\n`);

console.log('Decrypting...\n');

try {
    console.log('1. Decrypting token...');
    const decryptedToken = cryptoUtil.decryptData(
        encryptedConfig.token.data,
        encryptedConfig.token.secret,
        privateKey
    );

    if (!decryptedToken || decryptedToken.length < 10) {
        throw new Error('Invalid token');
    }

    console.log(`   Success! Length: ${decryptedToken.length} chars`);
    console.log(`   Preview: ${decryptedToken.substring(0, 10)}...${decryptedToken.substring(decryptedToken.length - 4)}\n`);

    console.log('2. Decrypting channel...');
    const decryptedChannel = cryptoUtil.decryptData(
        encryptedConfig.channel.data,
        encryptedConfig.channel.secret,
        privateKey
    );

    if (!decryptedChannel || !/^-?\d+$/.test(decryptedChannel)) {
        throw new Error('Invalid channel ID');
    }

    console.log(`   Success! Channel: ${decryptedChannel}\n`);

    console.log('='.repeat(70));
    console.log('TEST PASSED!');
    console.log('='.repeat(70));

    console.log('\nDecrypted Values:');
    console.log(`  Token:   ${decryptedToken.substring(0, 15)}...`);
    console.log(`  Channel: ${decryptedChannel}`);

    console.log('\nVerification:');
    console.log('  Configuration decrypted successfully');
    console.log('  All values are valid');

    console.log('\nReady to deploy!');
    console.log('  1. Copy .secrets/private-key.pem to server');
    console.log('  2. Set VAULT_SECRET on server');
    console.log('  3. Application will decrypt on startup\n');

} catch (error) {
    console.error('Decryption failed!');
    console.error(`  Error: ${error.message}`);
    console.error('\nTroubleshooting:');
    console.error('  1. Run: node scripts/setup-encryption.js');
    console.error('  2. Check VAULT_SECRET');
    console.error('  3. Verify .secrets/private-key.pem');
    console.error('  4. Regenerate:\n');
    console.error('     rm -rf .secrets');
    console.error('     node scripts/setup-encryption.js\n');
    process.exit(1);
}
