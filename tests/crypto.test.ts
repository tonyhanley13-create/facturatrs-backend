import { encrypt, decrypt, isEncrypted } from '../src/utils/crypto';

const originalSecret = process.env.SECRET_KEY;
beforeAll(() => {
  process.env.SECRET_KEY = 'test-secret-key-32-chars-for-aes-256-gcm';
});
afterAll(() => {
  if (originalSecret) process.env.SECRET_KEY = originalSecret;
  else delete process.env.SECRET_KEY;
});

describe('crypto', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('handles long strings', () => {
    const plaintext = 'a'.repeat(10000);
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('handles special characters', () => {
    const plaintext = '¡Hola! ñoño 你好 @#$%^&*()';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('isEncrypted detects encrypted format', () => {
    const plaintext = 'test123';
    const encrypted = encrypt(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('isEncrypted returns false for plain text', () => {
    expect(isEncrypted('hello')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('abc:def')).toBe(false); // missing third part
    expect(isEncrypted('abc:def:')).toBe(false); // empty third part
  });

  it('produces different ciphertexts for same plaintext (non-deterministic)', () => {
    const plaintext = 'same text';
    const e1 = encrypt(plaintext);
    const e2 = encrypt(plaintext);
    expect(e1).not.toBe(e2);
    expect(decrypt(e1)).toBe(plaintext);
    expect(decrypt(e2)).toBe(plaintext);
  });

  it('returns plaintext on non-encrypted format', () => {
    expect(decrypt('invalid')).toBe('invalid');
  });

  it('throws on invalid hex in encrypted string', () => {
    // ':'.repeat creates a string with 3 parts but invalid hex
    expect(() => decrypt('zz:zz:zz')).toThrow();
  });
});
