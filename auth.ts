import fs from 'fs'
import { ObjectId, WithId, type MongoClient } from 'mongodb'
import { fetchGroup, type User } from './admin'
import { decrypt, generateKey, hashWithSalt } from './encryption'
import { Metadata } from './file'

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

export const checkReadPermissions = async (client: MongoClient, metadata: Metadata, userInfo: WithId<User>) => {
    if (metadata.read === 'user' && metadata.owner != userInfo._id.toString()) {
        console.error("Invalid Permissions")
        return false
      } else if (metadata.read === 'group') {
        if (!userInfo.group) {
          console.error("Invalid Permissions")
          return false
        }
        const group = await fetchGroup(client, userInfo.group)
        if (!group) {
          console.error("Invalid Permissions")
          return false
        }
        const ownerUser = await fetchUser(client, metadata.owner)
        if (!ownerUser) {
          console.error("Owner no longer exists")
          return false
        }
        if (!ownerUser.group) {
          console.error("Invalid Permissions")
          return false
        }
        const ownerGroup = await fetchGroup(client, ownerUser.group)
        if (!ownerGroup) {
          console.error("Invalid Permissions")
          return false
        }
        if (ownerGroup.name != group.name) {
          console.error("Invalid Permissions")
          return false
        }
      }
    return true
}

export const checkWritePermissions = async (client: MongoClient, metadata: Metadata, userInfo: WithId<User>) => {
    if (metadata.write === 'user' && metadata.owner != userInfo._id.toString()) {
        console.error("Invalid Permissions")
        return false
      } else if (metadata.write === 'group') {
        if (!userInfo.group) {
          console.error("Invalid Permissions")
          return false
        }
        const group = await fetchGroup(client, userInfo.group)
        if (!group) {
          console.error("Invalid Permissions")
          return false
        }
        const ownerUser = await fetchUser(client, metadata.owner)
        if (!ownerUser) {
          console.error("Owner no longer exists")
          return false
        }
        if (!ownerUser.group) {
          console.error("Invalid Permissions")
          return false
        }
        const ownerGroup = await fetchGroup(client, ownerUser.group)
        if (!ownerGroup) {
          console.error("Invalid Permissions")
          return false
        }
        if (ownerGroup.name != group.name) {
          console.error("Invalid Permissions")
          return false
        }
      }
    return true
}