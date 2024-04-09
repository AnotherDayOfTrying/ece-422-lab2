import crypto from 'crypto';
import { User, fetchGroup } from './admin';
import { MongoClient } from 'mongodb';
import { PermissionMode } from './file';

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

export const hashFileIntegrity = (filename: string, data: string) => {
  return crypto.createHash('sha256').update(filename).update(data).digest('hex')
}

export const hashWithSalt = (data: string, salt: string) => {
  const hash = crypto.pbkdf2Sync(data, salt, 1000, 64, 'sha512').toString('hex');
  return hash
}

export const encryptWithPermission = async (client: MongoClient, buffer: Buffer, userInfo: User, permissionMode: PermissionMode) => {
  let returnData: Buffer;
  if (permissionMode == 'user') {
    returnData = encrypt(buffer, userInfo.key, Buffer.from(userInfo.iv, 'hex'))
  } else if (permissionMode == 'group') {
    if (!userInfo.group) {
      throw "User does not have group"
    }
    const group = await fetchGroup(client, userInfo.group)
    if (!group) {
      throw "User's Group does not exist"
    }
    returnData = encrypt(buffer, group.key, Buffer.from(group.iv, 'hex'))
  } else {
    returnData = buffer
  }
  return returnData
}

export const decryptWithPermission = async (client: MongoClient, encrypted: Buffer, userInfo: User, permissionMode: PermissionMode) => {
  let returnData: Buffer;
  if (permissionMode == 'user') {
    returnData = decrypt(encrypted, userInfo.key, Buffer.from(userInfo.iv, 'hex'))
  } else if (permissionMode == 'group') {
    if (!userInfo.group) {
      throw "User does not have group"
    }
    const group = await fetchGroup(client, userInfo.group)
    if (!group) {
      throw "User's Group does not exist"
    }
    returnData = decrypt(encrypted, group.key, Buffer.from(group.iv, 'hex'))
  } else {
    returnData = encrypted
  }
  return returnData
}

