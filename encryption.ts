import crypto from 'crypto';

const algorithm = 'aes-256-ctr';


export const generateKey = (password: string): string => {
    return crypto.createHash('sha256').update(password).digest('base64').substr(0, 32);
}

export const generateIV = (): Buffer => {
    return crypto.randomBytes(16);
}

export const encrypt = (buffer: Buffer, secretKey: string, iv: Buffer): Buffer => {
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return result;
};

export const decrypt = (encrypted: Buffer, secretKey: string, iv: Buffer): Buffer => {
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return result;
};

export const reencrypt = (encryptedData: Buffer, secretKey: string, iv: Buffer, newSecretKey: string, newIv: Buffer): Buffer => {
  return encrypt(decrypt(encryptedData, secretKey, iv), newSecretKey, newIv)
}

export const hashFileIntegrity = (data: string) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export const hashWithSalt = (data: string, salt: string) => {
  const hash = crypto.pbkdf2Sync(data, salt, 1000, 64, 'sha512').toString('hex');
  return hash
}