import { MongoClient, ObjectId } from "mongodb";
import { User, fetchGroup } from "./admin";
import { decrypt, encrypt, hashFileIntegrity } from "./encryption";
import path from "path";
import fs from "fs"

export type PermissionMode = "user" | "group" | "all"

export interface Metadata {
    name: string; // encrypted name of file or directory
    integrity: string; // integrity hash
    owner: string; //onwer id
    read: PermissionMode;
    write: PermissionMode;
}

export interface PermissionsInput {
    read: PermissionMode;
    write: PermissionMode;
}

export const fetchMetadata = async (client: MongoClient, filename: string) => {
    return await client.db('sfs').collection<Metadata>('metadata').findOne({name: filename})
}

export const createMetadata = async (client: MongoClient, metadata: Metadata) => {
    await client.db('sfs').collection<Metadata>('metadata').insertOne(metadata)
}

export const updateMetadata = async (client: MongoClient, name: string, metadata: Metadata) => {
    await client.db('sfs').collection<Metadata>('metadata').updateOne({name: name}, {
        $set: metadata
    })
}

export const deleteMetadata = async (client: MongoClient, name: string) => {
    await client.db('sfs').collection<Metadata>('metadata').deleteOne({name: name})
}

export const setPermissions = async (client: MongoClient, name: string, permissions: PermissionsInput) => {
    await client.db('sfs').collection<Metadata>('metadata').updateOne(
        {name: name},
        {$set: {
            read: permissions.read,
            write: permissions.write
        }}
    )
}

export const verifyUserFiles = async (client: MongoClient, user: string, root_dir: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({_id: new ObjectId(user)})
    if (!_user) {
        return
    }
    const pwd = path.join(root_dir, _user.username)
    await Promise.all(fs.readdirSync(pwd, {withFileTypes: true, recursive: true}).map(async (file) => {
        const filename = file.name.split('/')
        const metadata = await fetchMetadata(client, filename[filename.length - 1])
        if (!metadata) { // no metadata means filename has been modified
            console.error(`File ${path.join(pwd, file.name)} has been modified!`)
        } else {
            const data = fs.readFileSync(path.join(pwd, file.name)).toString()
            if (metadata.integrity !== hashFileIntegrity(filename[filename.length - 1], data)) {
                const fileName = decrypt(Buffer.from(file.name, 'hex'), _user.key, Buffer.from(_user.iv, 'hex')).toString()

                console.error(`File ${path.join(pwd, fileName)} has been modified!`)
            }
        }
    }))
}

export const fileExists = async (client: MongoClient, filename: string, userInfo: User, pwd: string): Promise<string | null> => {
    const cwd = process.cwd()
    try {
        process.chdir(path.join(pwd))
        if (fs.existsSync(filename)) return filename
        let encryptedFileName = encrypt(Buffer.from(filename, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
        if (fs.existsSync(encryptedFileName)) return encryptedFileName
        if (userInfo.group) {
            const group = await fetchGroup(client, userInfo.group)
            if (group)
                encryptedFileName = encrypt(Buffer.from(filename, 'utf-16le'), group.key, Buffer.from(group.iv, 'hex')).toString('utf-16le')
            if (fs.existsSync(encryptedFileName)) return encryptedFileName
        }
        return null
    } finally {
        process.chdir(cwd)
    }
}

export const encodePermission = (encryptedData: string, permissionMode: PermissionMode): string => {
    let permission = 'u'
    if (permissionMode === 'user') {
        permission = 'u'
    } else if (permissionMode === 'group') {
        permission = 'g'
    } else if (permissionMode === 'all') {
        permission = 'a'
    }

    return encryptedData + permission
}

export const parsePermission = (encryptedData: string): [string, PermissionMode] => {
    let permission = encryptedData.slice(-1);
    let permissionMode: PermissionMode = 'user'
    if (permission === 'u') {
        permissionMode = 'user'
    } else if (permission === 'g') {
        permissionMode = 'group'
    } else if (permission === 'a') {
        permissionMode = 'all'
    }
    return [encryptedData.slice(0, encryptedData.length - 1) , permissionMode]
}