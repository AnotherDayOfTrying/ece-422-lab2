import fs from 'fs'
import type { MongoClient } from 'mongodb'
import type { User } from './admin'

export const verifyAdmin = (password: string) => {
    return password === process.env.ADMIN_PASSWORD
}

export const loginUser = async (client: MongoClient, user: string, password: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({username: user});
    if (_user && _user.password === password) {
        fs.writeFileSync('./user', _user._id.toString());
    } else {
        console.log("Unable to authenticate...")
    }
}

export const logoutUser = () => {
    fs.writeFileSync('./user', '')
}