#!/usr/bin/env bun
import yargs from "yargs"
import fs from "fs"
import path from "path";
import { MongoClient, ServerApiVersion } from "mongodb";
import { addUserToGroup, createGroup, createUser, removeUserFromGroup } from "./admin";
import { fetchUser, loginUser, logoutUser, verifyAdmin } from "./auth";
import { generateKey, generateIV, encrypt, decrypt, hashFileIntegrity } from "./encryption";
import { createMetadata, updateMetadata } from "./file";

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
console.log(root)

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
            const encryptedPassword = encrypt(Buffer.from(args.pass as string, 'utf-8'), generateKey(process.env.ADMIN_PASSWORD!), Buffer.from(process.env.ADMIN_IV!, 'hex')).toString('hex')
            await createUser(client, args.user as string, encryptedPassword, generateKey(args.pass as string), generateIV().toString('hex'))
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
            await createGroup(client, args.name as string)
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
      await loginUser(client, args.user as string, args.password as string)
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
      fs.readdirSync(pwd, {
        withFileTypes: true
      }).forEach((file) => {
        const fileName = decrypt(Buffer.from(file.name, 'hex'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString()
        console.log(file.isDirectory() ? "/" + fileName : fileName)
      })
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
      if (root) {
        const cwd = process.cwd()
        process.chdir(path.join(pwd, args.dir as string))
        const newDirectory = Array.from(process.cwd().matchAll(/^.*\/file_system(.*)/g), m => m[1])[0]
        if (newDirectory) {
          fs.writeFileSync(cwd+'/pwd', newDirectory)
          console.log(newDirectory)
        }
        return
      }
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      const cwd = process.cwd()
      const directory = path.join(pwd, args.dir as string)
      if (!(args.dir as string).match(/^[0-9a-zA-Z]+$/)) {
        process.chdir(path.join(pwd, args.dir as string))
      } else {
        const encryptedDirectory = encrypt(Buffer.from(args.dir as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
        process.chdir(path.join(pwd, encryptedDirectory))
      }
      const newDirectory = Array.from(process.cwd().matchAll(/^.*\/file_system(.*)/g), m => m[1])[0]
      if (newDirectory) {
        fs.writeFileSync(cwd+'/pwd', newDirectory)
        console.log(directory)
      }
    })
  .command('mkdir [dir]', 'make a new subdirectory',
    (yargs)=>{
      yargs.positional('dir', {
        describe: 'directory to create',
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
      const encryptedDirectory = encrypt(Buffer.from(args.dir as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      if (!fs.existsSync(encryptedDirectory) && args.dir) {
        fs.mkdirSync(encryptedDirectory)
      } else {
        console.log("Directory already exists")
      }
    })
  .command('touch [file]', 'create a new file',
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
      process.chdir(path.join(pwd))
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      if (!fs.existsSync(encryptedFile) && args.file) {
        fs.writeFileSync(encryptedFile, '')
        await createMetadata(client, {
          name: encryptedFile,
          integrity: hashFileIntegrity(encryptedFile, ''),
          owner: userInfo._id.toString(),
          groups: [],
          userPermissions: [true, true],
          groupPermissions: [false, false],
          allPermissions: [false, false]
        })
      } else {
        console.log("File already exists")
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
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const file = fs.readFileSync(encryptedFile).toString()
        const fileData = decrypt(Buffer.from(file, 'hex'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString()
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
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const encryptedFileData = encrypt(Buffer.from(args.data as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
        fs.writeFileSync(encryptedFile, encryptedFileData)
        await updateMetadata(client, {
          name: encryptedFile,
          integrity: hashFileIntegrity(encryptedFile, encryptedFileData),
          owner: userInfo._id.toString(),
          groups: [],
          userPermissions: [true, true],
          groupPermissions: [false, false],
          allPermissions: [false, false]
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
      const encryptedFile = encrypt(Buffer.from(args.file as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      const newEncryptedFile = encrypt(Buffer.from(args.rfile as string, 'utf-8'), userInfo.key, Buffer.from(userInfo.iv, 'hex')).toString('hex')
      process.chdir(path.join(pwd))
      if (fs.existsSync(encryptedFile) && args.file) {
        const data = fs.readFileSync(encryptedFile).toString('utf-8')
        fs.renameSync(encryptedFile, newEncryptedFile)
        await updateMetadata(client, {
          name: encryptedFile,
          integrity: hashFileIntegrity(encryptedFile, data),
          owner: userInfo._id.toString(),
          groups: [],
          userPermissions: [true, true],
          groupPermissions: [false, false],
          allPermissions: [false, false]
        })
      }
    })
  .recommendCommands()
  .strictCommands()
  .demandCommand()
  .help('h')
  .alias('h', 'help')
  .parse()

//testing
process.exit()