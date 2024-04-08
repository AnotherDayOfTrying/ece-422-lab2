import { MongoClient, ObjectId } from "mongodb";
import { User } from "./admin";
import fs from "fs"
import { hashFileIntegrity } from "./encryption";
import path from "path";

export interface Metadata {
    name: string; // encrypted name of file or directory
    integrity: string; // integrity hash
    owner: string;
    groups: string[];
    userPermissions: boolean[];
    groupPermissions: boolean[];
    allPermissions: boolean[];
}

export const fetchMetadata = async (client: MongoClient, filename: string) => {
    return await client.db('sfs').collection<Metadata>('metadata').findOne({name: filename})
}

export const createMetadata = async (client: MongoClient, metadata: Metadata) => {
    await client.db('sfs').collection<Metadata>('metadata').insertOne(metadata)
}

export const updateMetadata = async (client: MongoClient, metadata: Metadata) => {
    await client.db('sfs').collection<Metadata>('metadata').updateOne({name: metadata.name}, metadata)
}

export const verifyUserFiles = async (client: MongoClient, user: string, root_dir: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({_id: new ObjectId(user)})
    if (!_user) {
        return
    }
    const pwd = path.join(root_dir, _user.username)
    await Promise.all(fs.readdirSync(pwd, {withFileTypes: true, recursive: true}).map(async (file) => {
        if (!file.isDirectory()) {
            const filename = file.name.split('/')
            const metadata = await fetchMetadata(client, filename[filename.length - 1])
            const data = fs.readFileSync(path.join(pwd, file.name)).toString()
            if (metadata?.integrity !== hashFileIntegrity(filename[filename.length - 1], data)) {
                console.error(`File ${path.join(pwd, file.name)} has been modified!`)
            }
        }
    }))
}