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
  console.log(secretKey)
  console.log(iv)
  console.log(iv.buffer.byteLength)
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([Buffer.from(iv), cipher.update(buffer), cipher.final()]);
  return result;
};

export const decrypt = (encrypted: string, secretKey: string): Buffer => {
  const iv = encrypted.slice(0, 16);
  const data = encrypted.slice(16);
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
  return result;
};