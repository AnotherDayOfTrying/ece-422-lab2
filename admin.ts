import { MongoClient } from "mongodb";


export interface User {
    username: string;
    password: string;
    salt: string;
    key: string;
    iv: string;
    group?: string;
}

export interface Group {
    name: string;
    key: string;
    iv: string;
    users: string[];
}

export const createUser = async (client: MongoClient, user: string, hashedPassword: string, salt: string, key: string, iv: string, group?: string) => {
    await client.db('sfs').collection<User>('users').insertOne({
        username: user,
        password: hashedPassword,
        salt: salt,
        key: key,
        iv: iv,
        group: group
    })
}

export const fetchGroup = async (client: MongoClient, group: string) => {
    return await client.db('sfs').collection<Group>('groups').findOne({name: group})
}

export const createGroup = async (client: MongoClient, group: string, key: string, iv: string, users: string[]) => {
    await client.db('sfs').collection<Group>('groups').insertOne({
        name: group,
        key: key,
        iv: iv,
        users: users,
    })
}

export const addUserToGroup = async (client: MongoClient, user: string, group: string) => {
    const _user = await client.db('sfs').collection<User>('users').updateOne(
        {username: user},
        {$set: {"group": group}}
    )

    if (!_user) {
        console.log(`No user found with name ${user}`)
        return
    }
    await client.db('sfs').collection<Group>('groups').updateOne(
        {name: group},
        {$addToSet: {"users": user}}
    )
}

export const removeUserFromGroup = async (client: MongoClient, user: string, group: string) => {
    await client.db('sfs').collection<User>('users').updateOne({username: user}, {$unset: {"group": 1}})
    await client.db('sfs').collection<Group>('groups').updateOne({name: group}, {$pull: {"users": user}})
}