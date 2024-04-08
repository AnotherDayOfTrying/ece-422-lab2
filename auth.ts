import fs from 'fs'
import { ObjectId, type MongoClient } from 'mongodb'
import type { User } from './admin'
import { decrypt, generateKey, hashWithSalt } from './encryption'

export const verifyAdmin = (password: string) => {
    return hashWithSalt(password, process.env.ADMIN_SALT!) === process.env.ADMIN_PASSWORD
}

export const fetchUser = async (client: MongoClient, userId: string) => {
    return await client.db('sfs').collection<User>('users').findOne({_id: new ObjectId(userId)})
}

export const loginUser = async (client: MongoClient, user: string, password: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({username: user});
    if (_user && _user.password === hashWithSalt(password, _user.salt)) {
        fs.writeFileSync('./user', _user._id.toString());
        fs.writeFileSync('./pwd', '/home')
        console.log(`Logged in as ${user}`)
    } else {
        console.log("Unable to authenticate...")
    }
    return _user
}

export const logoutUser = () => {
    fs.writeFileSync('./user', '')
    fs.writeFileSync('./pwd', '/home')
}