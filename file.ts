import { MongoClient, ObjectId } from "mongodb";
import { User } from "./admin";
import fs from "fs"
import { decrypt, hashFileIntegrity } from "./encryption";
import path from "path";
import { fetchUser } from "./auth";

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

export const checkReadLevel = async () => {
    
}

// return [read, write, level]
export const checkPermissions = async (client: MongoClient, userId: string, name: string) => {
    const metadata = await fetchMetadata(client, name)
    if (!metadata) return [false, false]
    const user = await fetchUser(client, userId)
    if (!user) return metadata.allPermissions
    let read = false
    let write = false
    const userPermissions = metadata.userPermissions
    const groupPermissions = metadata.groupPermissions
    const allPermissions = metadata.allPermissions
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
            if (metadata.integrity !== hashFileIntegrity(data)) {
                const fileName = decrypt(Buffer.from(file.name, 'hex'), _user.key, Buffer.from(_user.iv, 'hex')).toString()

                console.error(`File ${path.join(pwd, fileName)} has been modified!`)
            }
        }
    }))
}