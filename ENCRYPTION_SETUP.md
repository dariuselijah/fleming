# Healthcare LLM Encryption & Anonymization Setup

## Overview

This healthcare LLM application now includes robust encryption and data anonymization to ensure HIPAA compliance and protect sensitive health information.

## 🔐 Encryption Key

**IMPORTANT: Save this encryption key securely. You will need it to decrypt data.**

```
ENCRYPTION_KEY=asQPngDEzzs7l/phXa9RJ8KQMGmbe2s+jvfnlih+zEg=
```

### Setting the Encryption Key

Add this to your `.env` or `.env.local` file:

```bash
ENCRYPTION_KEY=asQPngDEzzs7l/phXa9RJ8KQMGmbe2s+jvfnlih+zEg=
```

**Security Notes:**
- Never commit the encryption key to version control
- Store it securely (use a secrets manager in production)
- If the key is lost, encrypted data cannot be recovered
- Rotate the key periodically for enhanced security

## 🔒 Encryption Features

### 1. **Message Encryption**
- All chat messages are encrypted at rest using AES-256-GCM
- Each message uses a unique initialization vector (IV)
- Messages are automatically encrypted when stored and decrypted when retrieved

### 2. **Health Data Encryption**
The following health data fields are encrypted:
- `health_context` - General health context
- `health_conditions` - Medical conditions
- `medications` - Current medications
- `allergies` - Known allergies
- `family_history` - Family medical history
- `lifestyle_factors` - Lifestyle information

### 3. **API Key Encryption**
- User API keys are already encrypted (existing feature)

## 🛡️ Data Anonymization

### PII/PHI Removal Before LLM Transmission

Before sending any data to third-party LLM providers, the system automatically removes:

1. **Personal Identifiers:**
   - Email addresses → `[EMAIL_REDACTED]`
   - Phone numbers → `[PHONE_REDACTED]`
   - Social Security Numbers → `[SSN_REDACTED]`
   - Credit card numbers → `[CARD_REDACTED]`
   - IP addresses → `[IP_REDACTED]`
   - URLs → `[URL_REDACTED]`
   - ZIP codes → `[ZIP_REDACTED]`

2. **Medical Identifiers:**
   - Medical record numbers (MRN) → `[MRN_REDACTED]`
   - Account numbers → `[ACCOUNT_REDACTED]`
   - Patient/Doctor names in medical contexts → `[MEDICAL_ID_REDACTED]`

3. **Personal Information:**
   - Names (in personal contexts) → `[NAME_REDACTED]`
   - Dates (birth dates, personal dates) → `[DATE_REDACTED]`
   - Years (birth years) → `[YEAR_REDACTED]`

### How It Works

1. **User sends message** → Stored encrypted in database
2. **Before sending to LLM** → Message is anonymized (PII/PHI removed)
3. **LLM receives** → Only anonymized, non-identifiable data
4. **Response stored** → Encrypted in database
5. **User sees** → Decrypted, original data (no anonymization visible)

## 📋 Database Migration

Run the migration script to add encryption support columns:

```bash
# Connect to your PostgreSQL database and run:
psql -d your_database_name -f migrate-encryption.sql
```

Or manually execute the SQL in `migrate-encryption.sql`:

```sql
-- Add IV column to messages table for encrypted content
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS content_iv TEXT;

-- Add IV columns to user_preferences table for encrypted health data
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS health_context_iv TEXT,
ADD COLUMN IF NOT EXISTS health_conditions_iv TEXT[],
ADD COLUMN IF NOT EXISTS medications_iv TEXT[],
ADD COLUMN IF NOT EXISTS allergies_iv TEXT[],
ADD COLUMN IF NOT EXISTS family_history_iv TEXT,
ADD COLUMN IF NOT EXISTS lifestyle_factors_iv TEXT;
```

## 🔧 Implementation Details

### Encryption Algorithm
- **Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key Size:** 32 bytes (256 bits)
- **IV Size:** 16 bytes (128 bits)
- **Authentication:** Built-in authentication tag prevents tampering

### Backward Compatibility
- Existing unencrypted data will continue to work
- New data will be encrypted if `ENCRYPTION_KEY` is set
- The system automatically detects encrypted vs. plaintext data

### Performance
- Encryption/decryption is fast and non-blocking
- Minimal performance impact on message storage/retrieval
- Anonymization happens in-memory before LLM transmission

## 🚀 Usage

### Enable Encryption

1. Set the `ENCRYPTION_KEY` environment variable
2. Run the database migration
3. Restart your application

### Verify Encryption is Working

Check the application logs for:
- `🔒 User message encrypted before storage`
- `🔒 Assistant message encrypted before storage`
- `🔒 Health data encrypted before storage`
- `🔓 Message decrypted during retrieval`
- `🔒 Messages anonymized before sending to LLM provider`

### Disable Encryption (Not Recommended)

If you need to disable encryption (not recommended for healthcare):
- Remove or comment out the `ENCRYPTION_KEY` environment variable
- Existing encrypted data will remain encrypted but cannot be decrypted
- New data will be stored as plaintext

## 🔍 Security Best Practices

1. **Key Management:**
   - Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Rotate keys periodically
   - Never log or expose the encryption key

2. **Database Security:**
   - Use encrypted database connections (SSL/TLS)
   - Restrict database access to application servers only
   - Enable database-level encryption at rest

3. **Network Security:**
   - Use HTTPS for all API communications
   - Implement rate limiting
   - Use API authentication/authorization

4. **Compliance:**
   - Regular security audits
   - Access logging and monitoring
   - Data retention policies
   - User consent and data deletion capabilities

## 📝 Notes

- **HIPAA Compliance:** This implementation helps with HIPAA compliance by:
  - Encrypting PHI at rest
  - Anonymizing data before transmission to third-party services
  - Using industry-standard encryption (AES-256-GCM)

- **Limitations:**
  - Anonymization is pattern-based and may not catch all PII variations
  - Medical dates are preserved for clinical context (only personal dates are removed)
  - Users should still be cautious about sharing highly sensitive information

## 🆘 Troubleshooting

### Encryption Not Working
- Verify `ENCRYPTION_KEY` is set in environment variables
- Check that the key is exactly 32 bytes when base64 decoded
- Review application logs for encryption warnings

### Decryption Errors
- Ensure the same encryption key is used for encryption and decryption
- Check that IV columns exist in the database
- Verify database migration was run successfully

### Anonymization Issues
- Review anonymization patterns in `lib/anonymize.ts`
- Check logs for anonymization warnings
- Test with sample data to verify PII removal

## 📚 Files Modified

- `lib/encryption.ts` - Enhanced encryption functions
- `lib/anonymize.ts` - New PII/PHI anonymization module
- `app/api/chat/route.ts` - Anonymization before LLM transmission
- `app/api/chat/api.ts` - Message encryption on storage
- `app/api/chat/db.ts` - Assistant message encryption
- `app/api/user-preferences/route.ts` - Health data encryption
- `lib/chat-store/messages/api.ts` - Message decryption on retrieval
- `migrate-encryption.sql` - Database migration script

## 🔐 Encryption Key Generation

To generate a new encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Or using OpenSSL:

```bash
openssl rand -base64 32
```






