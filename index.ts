#!/usr/bin/env bun
import yargs from "yargs"
import fs from "fs"
import path from "path";
import { MongoClient, ServerApiVersion } from "mongodb";
import { addUserToGroup, createGroup, createUser, removeUserFromGroup } from "./admin";
import { fetchUser, loginUser, logoutUser, verifyAdmin } from "./auth";
import { generateKey, generateIV, encrypt, decrypt } from "./encryption";

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

const pwd = "./file_system/" + fs.readFileSync("./pwd") // read pwd
const user = fs.readFileSync('./user').toString() // read user id

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
      const userInfo = await fetchUser(client, user)
      if (!userInfo) {
        console.error("No user is logged in...")
        return
      }
      fs.readdirSync(pwd, {
        withFileTypes: true
      }).forEach((file) => {
        const fileName = decrypt(Buffer.from(file.name, 'hex'), userInfo.key)
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
    (args) => {
      const cwd = process.cwd()
      process.chdir(path.join(pwd, args.dir as string))
      const newDirectory = Array.from(process.cwd().matchAll(/^.*\/file_system(.*)/g), m => m[1])[0]
      if (newDirectory) {
        fs.writeFileSync(cwd+'/pwd', newDirectory)
        console.log(newDirectory)
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
    (args) => {
      process.chdir(path.join(pwd))
      if (fs.existsSync(args.file as string) && args.file) {
        const file = fs.readFileSync(args.file as string)
        console.log(file.toString('utf-8'))
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
    (args) => {
      process.chdir(path.join(pwd))
      if (fs.existsSync(args.file as string) && args.file) {
        fs.writeFileSync(args.file as string, args.data as string)
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
    (args) => {
      process.chdir(path.join(pwd))
      if (fs.existsSync(args.file as string) && args.file) {
        fs.renameSync(args.file as string, args.rfile as string)
      }
    })
  // .command('encrypt [file]', 'encrypt a file', 
  //   (yargs) => {
  //     yargs.positional('file', {
  //       describe: 'file to encrypt',
  //       default: '',
  //       type: 'string'
  //     });
  //   },
  //   (args) => {
  //     process.chdir(path.join(pwd))
  //     if (fs.existsSync(args.file as string)) {
  //       const fileContent = fs.readFileSync(args.file);
  //       const encryptedContent = encrypt(fileContent);
  //       fs.writeFileSync(args.file, encryptedContent);
  //       console.log(`File encrypted: ${args.file}`);
  //     } else {
  //       console.log('File not found');
  //     }
  //   })
  //   .command('decrypt [file]', 'decrypt a file',
  //   (yargs) => {
  //     yargs.positional('file', {
  //       describe: 'file to decrypt',
  //       type: 'string',
  //       demandOption: true,
  //     });
  //   },
  //   (args) => {
  //     process.chdir(path.join(pwd))
  //     if (fs.existsSync(args.file)) {
  //       const fileContent = fs.readFileSync(args.file);
  //       try {
  //         const decryptedContent = decrypt(fileContent);
  //         fs.writeFileSync(args.file, decryptedContent);
  //         console.log(`File decrypted: ${args.file}`);
  //       } catch (error) {
  //         console.log('Failed to decrypt file. It may have been altered or is not encrypted.');
  //       }
  //     } else {
  //       console.log('File not found');
  //     }
  //   })
  .recommendCommands()
  .strictCommands()
  .demandCommand()
  .help('h')
  .alias('h', 'help')
  .parse()

//testing
process.exit()