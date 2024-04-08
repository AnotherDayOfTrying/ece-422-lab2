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
            const metadata = await fetchMetadata(client, file.name)
            const data = fs.readFileSync(path.join(pwd, file.name)).toString()
            console.log(hashFileIntegrity(file.name, data))
            console.log(file)
            console.log(metadata)
            console.log(data)
            if (metadata?.integrity !== hashFileIntegrity(file.name, data)) {
                console.error(`File ${file.path} has been modified!`)
            }
        }
    }))
    // .forEach(async (file) => {
    //     if (!file.isDirectory) {
    //         const metadata = await fetchMetadata(client, file.name);
    //         const data = fs.readFileSync(file.path).toString()
    //         console.log(file)
    //         console.log(metadata)
    //         console.log(data)
    //         if (metadata?.integrity !== hashFileIntegrity(file.name, data)) {
    //             console.error(`File ${file.path} has been modified!`)
    //         }
    //     }
    // })
}