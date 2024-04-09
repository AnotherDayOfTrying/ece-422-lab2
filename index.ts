#!/usr/bin/env bun
import yargs from "yargs"
import fs, { read, write } from "fs"
import path from "path";
import crypto from "crypto"
import { MongoClient, ServerApiVersion } from "mongodb";
import { addUserToGroup, createGroup, createUser, fetchGroup, removeUserFromGroup } from "./admin";
import { fetchUser, loginUser, logoutUser, verifyAdmin } from "./auth";
import { generateKey, generateIV, encrypt, decrypt, hashFileIntegrity, hashWithSalt, decryptWithPermission, encryptWithPermission } from "./encryption";
import { PermissionMode, createMetadata, deleteMetadata, fetchMetadata, fileExists, updateMetadata, verifyUserFiles } from "./file";


const uri = `mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+2.2.3`

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
})

// connect to db
await client.connect();
const ROOT_DIR = './file_system/home'
const pwd = "./file_system" + fs.readFileSync("./pwd") // read pwd
const user = fs.readFileSync('./user').toString() // read user id
const root = Array.from(pwd.matchAll(/^.*\/file_system\/home(.*)/g), m => m[1])[0] ? false : true

await yargs(process.argv.slice(2))
  .env('sfs')
  .scriptName('sfs')
  .usage('Usage: $0 <command> [options]')
  .command('admin', 'admin commmands',
    (yargs) => {
      yargs
        .option('adminpass', {
          demandOption: true,
        })
        .middleware((yargs) => {
            if (!verifyAdmin(yargs.adminpass as string)) throw "incorrect admin password"
        })
        .command('createUser [user] [pass]', "create a new user",
          (yargs) => {
            yargs
              .positional('user', {
                type: 'string',
                demandOption: true,
              })
              .positional('pass', {
                type: 'string',
                demandOption: true,
              })
          },
          async (args) => {
            if (!(args.user && args.pass)) throw "invalid inputs"
            const salt = crypto.randomBytes(16).toString('hex'); 
            const hashedPassword = hashWithSalt(args.pass as string, salt)
            await createUser(client, args.user as string, hashedPassword, salt, generateKey(args.pass as string), generateIV().toString('hex'))
            fs.mkdirSync(path.join(ROOT_DIR, args.user as string)) // create new folder for user
            console.log(`Created User: ${args.user}`)
          }
        )
        .command('createGroup [name]', "create new group",
          (yargs) => {
            yargs
              .positional('name', {
                type: 'string',
                demandOption: true,
              })
          },
          async (args) => {
            if (!args.name) throw "invalid inputs"
            await createGroup(client, args.name as string, generateKey(args.name as string), generateIV().toString('hex'), [])
            console.log(`Created Group: ${args.name}`)
          }
        )
        .command('addToGroup [user] [group]', "add user to group",
          (yargs) => {
            yargs.
              positional('user', {
                demandOption: true,
              })
              .positional('group', {
                demandOption: true,
              })
          },
          async (args) => {
            if (!(args.user && args.group)) throw "invalid inputs"
            await addUserToGroup(client, args.user as string, args.group as string)
            console.log(`Added ${args.user} to group ${args.group}`)
          }
        )
        .command('removeFromGroup [user] [group]', "remove user from group",
          (yargs) => {
            yargs.
              positional('user', {
                demandOption: true,
              })
              .positional('group', {
                demandOption: true,
              })
          },
          async (args) => {
            if (!(args.user && args.group)) throw "invalid inputs"
            await removeUserFromGroup(client, args.user as string, args.group as string)
            console.log(`Removed ${args.user} from group ${args.group}`)
          }
        )
        .demandCommand()
    }
  )
  .command('login [user] [password]', 'login to user',
    (yargs) => {
      yargs
        .positional('user', {
          demandOption: true
        })
        .positional('password', {
          demandOption: true
        })
    },
    async (args) => {
      if (!(args.user && args.password)) throw "invalid input"
      const user = await loginUser(client, args.user as string, args.password as string)
      if (user) {
        await verifyUserFiles(client, user._id.toString(), ROOT_DIR)
      }
    }
  )
  .command('logout', 'logout user',
    () => {},
    () => {
      logoutUser()
      console.log(`Logged out...`)
    }
  )
  .command('pwd', 'see what directory you are currently in',
    (args)=>{
    },
    (args) => {
      const directory = Array.from((pwd).matchAll(/^.*\/file_system\/(.*)/g), m => m[1])[0]
      console.log(directory)
    })
  .command('ls', 'list the files in current directory',
    (args)=>{
    },
    async (args) => {
      console.log(root)
      if (root) {
        fs.readdirSync(pwd, {withFileTypes: true}).forEach((file) => {
          console.log(file.isDirectory() ? "/" + file.name : file.name)
        })
        return
      }
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      console.log("IN LS")
      await Promise.all(fs.readdirSync(pwd, {
        withFileTypes: true
      }).map(async (file) => {
        const metadata = await fetchMetadata(client, file.name)
        if (!metadata) {
          console.error("Metadata not found for file")
          return
        }
        console.log("HERE")
        console.log(file.name)
        const fileName = (await decryptWithPermission(client, Buffer.from(file.name, 'utf-16le'), userInfo, metadata.read)).toString()   
        console.log(fileName)     
        console.log(file.isDirectory() ? "/" + fileName : fileName)
      }))
    })
  .command('cd [dir]', 'change directory',
    (yargs)=>{
      yargs.positional('dir', {
        describe: 'directory to change to',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      if (root) {
        if (userInfo.username != args.dir) {
          if (userInfo.group) {
            const group = await fetchGroup(client, userInfo.group)
            if (group) {
              if (!group.users.some((user) => user === args.dir)) {
                console.error("Invalid Permissions")
                return
              }
            } else {
              console.error("Invalid Permissions")
              return
            }
          } else {
            console.error("Invalid Permissions")
            return
          }
        }
        const cwd = process.cwd()
        process.chdir(path.join(pwd, args.dir as string))
        const newDirectory = Array.from(process.cwd().matchAll(/^.*\/file_system(.*)/g), m => m[1])[0]
        if (newDirectory) {
          fs.writeFileSync(cwd+'/pwd', newDirectory)
          console.log(newDirectory)
        }
        return
      }
      const cwd = process.cwd()
      const directory = path.join(pwd, args.dir as string)
      if (!(args.dir as string).match(/^[0-9a-zA-Z]+$/)) {
        process.chdir(path.join(pwd, args.dir as string))
      } else {
        const encryptedDirectory = await fileExists(client, args.dir as string, userInfo, pwd)
        if (!encryptedDirectory) {
          console.error("Directory does not exist")
          return
        }
        const metadata = await fetchMetadata(client, encryptedDirectory)
        if (!metadata) {
          console.error("Directory does not exist")
          return
        }

        if (metadata.read === 'user' && metadata.owner != userInfo._id.toString()) {
          console.error("Invalid Permissions")
          return
        } else if (metadata.read === 'group') {
          if (!userInfo.group) {
            console.error("Invalid Permissions")
            return
          }
          const group = await fetchGroup(client, userInfo.group)
          if (!group) {
            console.error("Invalid Permissions")
            return
          }
          const ownerUser = await fetchUser(client, metadata.owner)
          if (!ownerUser) {
            console.error("Owner no longer exists")
            return
          }
          if (!ownerUser.group) {
            console.error("Invalid Permissions")
            return
          }
          const ownerGroup = await fetchGroup(client, ownerUser.group)
          if (!ownerGroup) {
            console.error("Invalid Permissions")
            return
          }
          if (ownerGroup.name != group.name) {
            console.error("Invalid Permissions")
            return
          }
        }
        process.chdir(path.join(pwd, encryptedDirectory))
      }
      const newDirectory = Array.from(process.cwd().matchAll(/^.*\/file_system(.*)/g), m => m[1])[0]
      if (newDirectory) {
        fs.writeFileSync(cwd+'/pwd', newDirectory)
        console.log(directory)
      }
    })
  .command('mkdir [dir] [-r (u|g|a)] [-w (u|g|a)]', 'make a new subdirectory',
    (yargs)=>{
      yargs.positional('dir', {
        describe: 'directory to create',
        default: '',
        type: 'string'
      })
      .option('r', { //read
        default: 'u'
      })
      .option('w', { //write
        default: 'u'
      })
    },
    async (args) => {
      if (root) {
        console.error("cannot mkdir in root")
        return
      }
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }

      let read: PermissionMode = 'user'
      let write: PermissionMode = 'user'
      // parse read and write
      if (args.r === 'u') {
        read = 'user'
      } else if (args.r === 'g') {
        read = 'group'
      } else if (args.r === 'a') {
        read = 'all'
      }

      if (args.w === 'u') {
        write = 'user'
      } else if (args.w === 'g') {
        write = 'group'
      } else if (args.w === 'a') {
        write = 'all'
      }

      process.chdir(path.join(pwd))
      const encryptedDirectory = (await encryptWithPermission(client, Buffer.from(args.dir as string, 'utf-16le'), userInfo, read)).toString('utf-16le')
      if (!fs.existsSync(encryptedDirectory) && args.dir) {
        fs.mkdirSync(encryptedDirectory)
        await createMetadata(client, {
          name: encryptedDirectory,
          integrity: hashFileIntegrity(encryptedDirectory, ''),
          owner: userInfo._id.toString(),
          read: read,
          write: write,
        })
      } else {
        console.log("Directory already exists")
      }
    })
  .command('touch [file] [-r (u|g|a)] [-w (u|g|a)]', 'create a new file',
    (yargs) => {
      yargs.positional('file', {
        describe: 'file to create',
        default: '',
        type: 'string'
      })
      .option('r', { //read
        default: 'u'
      })
      .option('w', { //write
        default: 'u'
      })
    },
    async (args) => {
      if (root) {
        console.error("cannot create in root")
        return
      }
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }

      let read: PermissionMode = 'user'
      let write: PermissionMode = 'user'
      // parse read and write
      if (args.r === 'u') {
        read = 'user'
      } else if (args.r === 'g') {
        read = 'group'
      } else if (args.r === 'a') {
        read = 'all'
      }

      if (args.w === 'u') {
        write = 'user'
      } else if (args.w === 'g') {
        write = 'group'
      } else if (args.w === 'a') {
        write = 'all'
      }

      process.chdir(path.join(pwd))
      const encryptedFile = (await encryptWithPermission(client, Buffer.from(args.file as string, 'utf-16le'), userInfo, read)).toString('utf-16le')
      if (!fs.existsSync(encryptedFile) && args.file) {
        fs.writeFileSync(encryptedFile, '')
        await createMetadata(client, {
          name: encryptedFile,
          integrity: hashFileIntegrity(encryptedFile, ''),
          owner: userInfo._id.toString(),
          read: read,
          write: write,
        })
      } else {
        console.log("File already exists")
      }
    })
  .command('rm [file]', 'remove file',
    (yargs) => {
      yargs.positional('file', {
        describe: 'file to create',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      const encryptedFile = await fileExists(client, args.file as string, userInfo, pwd)
      if (!encryptedFile) {
        console.error("Does not exist")
        return
      }

      const metadata = await fetchMetadata(client, encryptedFile)
      if (!metadata) {
        console.error("No metadata")
        return
      }

      if (metadata.write === 'user' && metadata.owner != userInfo._id.toString()) {
        console.error("Invalid Permissions")
        return
      } else if (metadata.write === 'group') {
        if (!userInfo.group) {
          console.error("Invalid Permissions")
          return
        }
        const group = await fetchGroup(client, userInfo.group)
        if (!group) {
          console.error("Invalid Permissions")
          return
        }
        const ownerUser = await fetchUser(client, metadata.owner)
        if (!ownerUser) {
          console.error("Owner no longer exists")
          return
        }
        if (!ownerUser.group) {
          console.error("Invalid Permissions")
          return
        }
        const ownerGroup = await fetchGroup(client, ownerUser.group)
        if (!ownerGroup) {
          console.error("Invalid Permissions")
          return
        }
        if (ownerGroup.name != group.name) {
          console.error("Invalid Permissions")
          return
        }
      }
      process.chdir(path.join(pwd))
      // const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      if (fs.existsSync(encryptedFile) && args.file) {
        fs.unlinkSync(encryptedFile)
        await deleteMetadata(client, encryptedFile)
      } else {
        console.log("File does not exist")
      }
    })
  .command('rmdir [dir]', 'remove directory',
    (yargs) => {
      yargs.positional('dir', {
        describe: 'dir to remove',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      process.chdir(path.join(pwd))
      const encryptedFile = encrypt(Buffer.from(args.dir as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      if (fs.existsSync(encryptedFile) && args.dir) {
        fs.rmdirSync(encryptedFile)
        await deleteMetadata(client, encryptedFile)
      } else {
        console.log("File does not exist")
      }
    })
  .command('cat [file]', 'read a file',
    (yargs)=>{
      yargs.positional('file', {
        describe: 'file to create',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const file = fs.readFileSync(encryptedFile).toString()
        const fileData = decrypt(Buffer.from(file, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString()
        console.log(fileData)
      } else {
        console.log("File does not exist")
      }
    })
  .command('echo [file] [data]', 'write to a file',
    (yargs)=>{
      yargs.positional('file', {
        describe: 'file to write to',
        default: '',
        type: 'string'
      })
      .positional('data', {
        describe: 'data to write into file',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const encryptedFileData = encrypt(Buffer.from(args.data as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
        fs.writeFileSync(encryptedFile, encryptedFileData)
        await updateMetadata(client, encryptedFile, {
          name: encryptedFile,
          integrity: hashFileIntegrity(encryptedFile, encryptedFileData),
          owner: userInfo._id.toString(),
          read: 'user',
          write: 'user',
        })
      } else {
        console.log("File does not exist")
      }
    })
  .command('mv [file] [rfile]', 'rename a file',
    (yargs)=>{
      yargs.positional('file', {
        describe: 'file to write to',
        default: '',
        type: 'string'
      })
      .positional('rfile', {
        describe: 'data to write into file',
        default: '',
        type: 'string'
      })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      const newEncryptedFile = encrypt(Buffer.from(args.rfile as string, 'utf-16le'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('utf-16le')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const data = fs.readFileSync(encryptedFile).toString()
        fs.renameSync(encryptedFile, newEncryptedFile)
        await updateMetadata(client, encryptedFile, {
          name: newEncryptedFile,
          integrity: hashFileIntegrity(newEncryptedFile, data),
          owner: userInfo._id.toString(),
          read: 'user',
          write: 'user'
        })
      }
    })
  .command('changePermissions [file] [-r (u|g|a)] [-w (u|g|a)]', 'Change permission of a file',
    (yargs) => {
      yargs
        .positional('file', {
          demandOption: true
        })
        .option('r', { //read
          default: 'u'
        })
        .option('w', { //write
          default: 'u'
        })
    },
    async (args) => {
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      if (!(args.file && args.r && args.w)) return
      const encryptedFile = await fileExists(client, args.file as string, userInfo, pwd)
      if (!encryptedFile) {
        console.error("File does not exist")
        return
      }
      const metadata = await fetchMetadata(client, encryptedFile)
      if (!metadata) return
      if (metadata.owner !== userInfo._id.toString()) {
        console.error("User is not the owner of the file")
      }
      let read: PermissionMode = 'user'
      let write: PermissionMode = 'user'
      // parse read and write
      if (args.r === 'u') {
        read = 'user'
      } else if (args.r === 'g') {
        read = 'group'
      } else if (args.r === 'a') {
        read = 'all'
      }

      if (args.w === 'u') {
        write = 'user'
      } else if (args.w === 'g') {
        write = 'group'
      } else if (args.w === 'a') {
        write = 'all'
      }

      // unencrypt file 
      const file = fs.readFileSync(encryptedFile).toString()
      let newFileName = (await decryptWithPermission(client, Buffer.from(encryptedFile, 'utf-16le'), userInfo, metadata.read)).toString()
      let newFileData = (await decryptWithPermission(client, Buffer.from(file, 'utf-16le'), userInfo, metadata.read)).toString()
      newFileName = (await encryptWithPermission(client, Buffer.from(newFileName, 'utf-16le'), userInfo, read)).toString('utf-16le')
      newFileData = (await encryptWithPermission(client, Buffer.from(newFileData, 'utf-16le'), userInfo, read)).toString('utf-16le')
      fs.renameSync(encryptedFile, newFileName)
      fs.writeFileSync(newFileName, newFileData)
      await updateMetadata(client, encryptedFile, {
        name: newFileName,
        integrity: hashFileIntegrity(newFileName, newFileData),
        owner: userInfo._id.toString(),
        read: read,
        write: write,
      })
    }
  )
  .command('whoami', 'display which user you are',
    () => {},
    async () => {
      if (!user) {
        console.log("Currently not logged in...")
        return
      }
      const _user = await fetchUser(client, user)
      console.log(_user?.username)
    }
  )
  .recommendCommands()
  .strictCommands()
  .demandCommand()
  .help('h')
  .alias('h', 'help')
  .parse()

//testing
process.exit()