import fs from 'fs'
import type { MongoClient } from 'mongodb'
import type { User } from './admin'
import { decrypt, generateKey } from './encryption'

export const verifyAdmin = (password: string) => {
    return password === process.env.ADMIN_PASSWORD
}

export const loginUser = async (client: MongoClient, user: string, password: string) => {
    const _user = await client.db('sfs').collection<User>('users').findOne({username: user});
    console.log(decrypt(Buffer.from(_user.password, 'base64'), generateKey(process.env.ADMIN_PASSWORD || '')).toString())
    if (_user && decrypt(Buffer.from(_user.password, 'base64'), generateKey(process.env.ADMIN_PASSWORD || '')).toString() === password) {
        fs.writeFileSync('./user', _user._id.toString());
        console.log(`Logged in as ${user}`)
    } else {
        console.log("Unable to authenticate...")
    }
}

export const logoutUser = () => {
    fs.writeFileSync('./user', '')
}