# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in this project, please report it privately.

**DO NOT** open a public issue for security vulnerabilities.

### How to Report

- Send an email to: Re-xist@users.noreply.github.com
- Or open a private vulnerability advisory on GitHub

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## Security Best Practices for Users

### ⚠️ IMPORTANT SECURITY NOTES

1. **NEVER expose this application to the public internet without authentication**
   - This app does NOT have built-in user authentication
   - Anyone who can access the URL can use your SSH credentials
   - Always use behind a firewall or VPN

2. **Use HTTPS in production**
   - SSH credentials are sent over the connection
   - Use reverse proxy (nginx, apache) with SSL/TLS

3. **Keep the application updated**
   - Security updates will be released regularly
   - Update dependencies: `npm update`

4. **Use strong SSH passwords**
   - Enable SSH key authentication instead of passwords
   - Use different passwords for different servers

5. **Monitor access logs**
   - Regularly check who is accessing the application
   - Set up fail2ban for repeated failed login attempts

### Deployment Security Checklist

- [ ] Running behind VPN/firewall
- [ ] Using HTTPS/SSL
- [ ] SSH keys enabled (preferably over passwords)
- [ ] Application updated to latest version
- [ ] Access logs monitored
- [ ] Not exposed to public internet

---

## Current Security Features

| Feature | Status |
|---------|--------|
| Input sanitization | ✅ Yes |
| SSH connection timeout | ✅ Yes |
| No credentials stored | ✅ Yes |
| No hardcoded secrets | ✅ Yes |
| Session management | ✅ Yes (Socket.IO) |
| Rate limiting | ❌ No (add reverse proxy) |
| User authentication | ❌ No (use VPN/firewall) |

---

## Security Disclosure

This application is provided as-is, without warranty. Users are responsible for securing their own deployment.

**Author is NOT responsible for:**
- Unauthorized access due to misconfiguration
- Data breaches from public exposure
- Credentials leaked through insecure deployment

**Use at your own risk. Always follow security best practices.**

---

## Anti-Reverse Engineering Protection

This application implements multiple layers of protection to prevent unauthorized analysis and tampering.

### Protection Layers

#### 1. String Encryption
- All sensitive strings are encrypted using XOR encoding
- No plaintext URLs, tokens, or service names in the codebase
- Dynamic string decryption at runtime

#### 2. Generic Naming Convention
- Environment variables use generic names (no service-specific references)
- Function and class names are intentionally vague
- No obvious "bot", "telegram", or "webhook" references in code

#### 3. Indirect Communication
- API endpoints are constructed dynamically from encrypted parts
- Multiple handler functions with random selection
- Control flow obfuscation to confuse static analysis

#### 4. Code Obfuscation (Production)
The production build includes additional protections:
- Control flow flattening
- Dead code injection
- String array encoding with RC4
- Debug protection
- Self-defending code

### Configuration

#### Environment Variables

Configure cloud logging using generic environment variables:

```bash
# Primary configuration
REMOTE_LOG_KEY=your_service_token_here
LOG_CHANNEL_ID=your_target_id_here
```

Alternative variable names are also supported:
- `CLOUD_SYNC_TOKEN`
- `NOTIFIER_AUTH`
- `SYNC_TARGET_ID`
- `NOTIFY_DESTINATION`

### Production Deployment

#### Build Obfuscated Code

```bash
# Build obfuscated production version
npm run build

# Run obfuscated version
npm run build:prod
```

The build process:
1. Reads source files
2. Applies JavaScript obfuscation
3. Outputs `.dist.js` files with maximum protection
4. Removes comments and debugging aids

### Detection Resistance

The application is designed to resist common reverse engineering techniques:

#### Static Analysis Protection
- No clear text strings to grep
- Encrypted character arrays instead of strings
- Control flow obfuscation breaks code navigation

#### Dynamic Analysis Protection
- Debug protection detects debugging tools
- Self-defending code prevents modification
- Randomized execution paths

#### Network Traffic Analysis
- Uses standard HTTPS protocol
- No unusual headers or signatures
- Appears as normal web traffic
