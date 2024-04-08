import { MongoClient } from "mongodb";
import { encrypt, generateIV, generateKey } from "./encryption";


export interface User {
    username: string;
    password: string;
    key: string;
}

export interface Group {
    name: string;
    users: string[];
}

export const createUser = async (client: MongoClient, user: string, encryptedPassword: string, key: string, iv: string) => {
    await client.db('sfs').collection('users').insertOne({
        username: user,
        password: encryptedPassword, //!!! TODO: encrypt password
        key: key,
        iv: iv,
    })
}

export const createGroup = async (client: MongoClient, group: string) => {
    await client.db('sfs').collection('groups').insertOne({
        name: group,
        users: [],
    })
}

export const addUserToGroup = async (client: MongoClient, user: string, group: string) => {
    await client.db('sfs').collection<Group>('groups').updateOne(
        {name: group},
        {$addToSet: {"users": user}}
    )
}

export const removeUserFromGroup = async (client: MongoClient, user: string, group: string) => {
    await client.db('sfs').collection<Group>('groups').updateOne({name: group}, {$pull: {"users": user}})
}