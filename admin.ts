import { MongoClient } from "mongodb";


export interface User {
    username: string;
    password: string;
    key: string;
}

export interface Group {
    name: string;
    users: string[];
}

export const createUser = async (client: MongoClient, user: string, password: string, key: string) => {
    await client.db('sfs').collection('users').insertOne({
        username: user,
        password: password, //!!! TODO: encrypt password
        key: key,
    })
}

export const createGroup = async (client: MongoClient, group: string) => {
    await client.db('sfs').collection('groups').insertOne({
        name: group,
        users: [],
    })
}

export const loginUser = async (client: MongoClient, user: string, password: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({username: user})
    return _user?.password === password
}

export const addUserToGroup = async (client: MongoClient, user: string, group: string) => {
    await client.db('sfs').collection<Group>('groups').updateOne({groupName: group}, {$push: {"users": user}})
}

export const removeUserFromGroup = async (client: MongoClient, user: string, group: string) => {
    await client.db('sfs').collection<Group>('groups').updateOne({groupName: group}, {$pull: {"users": user}})
}

export const logoutUser = async () => {

}