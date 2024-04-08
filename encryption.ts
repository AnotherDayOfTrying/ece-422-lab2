import crypto from 'crypto';

const algorithm = 'aes-256-ctr';
const password = 'password'; 
const secretKey = crypto.createHash('sha256').update(String(password)).digest('base64').substr(0, 32);
const iv = crypto.randomBytes(16);

export const encrypt = (buffer: Buffer): Buffer => {
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  return result;
};

export const decrypt = (encrypted: Buffer): Buffer => {
  const iv = encrypted.slice(0, 16);
  const data = encrypted.slice(16);
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([decipher.update(data), decipher.final()]);
  return result;
};