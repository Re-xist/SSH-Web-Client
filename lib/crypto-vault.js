const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const RSA_BITS = 4096;

function deriveKey(secret, salt) {
    return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, 'sha256');
}

function encryptAES(plaintext, secret) {
    try {
        const salt = crypto.randomBytes(32);
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = deriveKey(secret, salt);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let ciphertext = cipher.update(plaintext, 'utf8', 'binary');
        ciphertext += cipher.final('binary');
        const authTag = cipher.getAuthTag();

        const combined = Buffer.concat([salt, iv, authTag, Buffer.from(ciphertext, 'binary')]);
        return combined.toString('base64');
    } catch (error) {
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

function decryptAES(encryptedData, secret) {
    try {
        const combined = Buffer.from(encryptedData, 'base64');

        const salt = combined.slice(0, 32);
        const iv = combined.slice(32, 32 + IV_LENGTH);
        const authTag = combined.slice(32 + IV_LENGTH, 32 + IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = combined.slice(32 + IV_LENGTH + AUTH_TAG_LENGTH);

        const key = deriveKey(secret, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let plaintext = decipher.update(ciphertext, 'binary', 'utf8');
        plaintext += decipher.final('utf8');

        return plaintext;
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

function generateKeyPair() {
    try {
        return crypto.generateKeyPairSync('rsa', {
            modulusLength: RSA_BITS,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
    } catch (error) {
        throw new Error(`Key generation failed: ${error.message}`);
    }
}

function encryptPublic(data, publicKey) {
    try {
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
    } catch (error) {
        throw new Error(`Public key encryption failed: ${error.message}`);
    }
}

function decryptPrivate(encryptedData, privateKey) {
    try {
        const buffer = Buffer.from(encryptedData, 'base64');
        const decrypted = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            buffer
        );
        return decrypted.toString('utf8');
    } catch (error) {
        throw new Error(`Private key decryption failed: ${error.message}`);
    }
}

function encryptData(plaintext, secret, publicKey) {
    try {
        const encryptedData = encryptAES(plaintext, secret);
        const encryptedSecret = encryptPublic(secret, publicKey);

        return {
            data: encryptedData,
            key: encryptedSecret
        };
    } catch (error) {
        throw new Error(`Data encryption failed: ${error.message}`);
    }
}

function decryptData(encryptedData, encryptedKey, privateKey) {
    try {
        const secret = decryptPrivate(encryptedKey, privateKey);
        const plaintext = decryptAES(encryptedData, secret);
        return plaintext;
    } catch (error) {
        throw new Error(`Data decryption failed: ${error.message}`);
    }
}

class DataVault {
    constructor(masterKey) {
        this.masterKey = masterKey;
        this._store = new Map();
    }

    set(key, value) {
        const encrypted = encryptAES(JSON.stringify(value), this.masterKey);
        this._store.set(key, encrypted);
        return this;
    }

    get(key) {
        const encrypted = this._store.get(key);
        if (!encrypted) return null;
        try {
            return JSON.parse(decryptAES(encrypted, this.masterKey));
        } catch {
            return null;
        }
    }

    has(key) {
        return this._store.has(key);
    }

    delete(key) {
        return this._store.delete(key);
    }

    clear() {
        this._store.clear();
        return this;
    }
}

module.exports = {
    encryptAES,
    decryptAES,
    generateKeyPair,
    encryptPublic,
    decryptPrivate,
    encryptData,
    decryptData,
    DataVault,
    ALGORITHM,
    KEY_LENGTH,
    IV_LENGTH,
    RSA_BITS
};
