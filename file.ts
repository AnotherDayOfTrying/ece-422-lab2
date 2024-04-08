import { MongoClient, ObjectId } from "mongodb";
import { User } from "./admin";

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

export const verifyUserFiles = async (client: MongoClient, user: string, pwd: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({_id: new ObjectId(user)})
    

}