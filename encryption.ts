import crypto from 'crypto';

const algorithm = 'aes-256-ctr';
// const password = 'password'; 
// const secretKey = crypto.createHash('sha256').update(String(password)).digest('base64').substr(0, 32);
// const iv = crypto.randomBytes(16);


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