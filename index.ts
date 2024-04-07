#!/usr/bin/env bun
import yargs from "yargs"
import fs from "fs"
import path from "path";
import { MongoClient, ServerApiVersion } from "mongodb";
import { createUser } from "./admin";
import { verifyAdmin } from "./auth";

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

const pwd = "./file_system/" + fs.readFileSync("./pwd")

yargs(process.argv.slice(2))
  .env('sfs')
  .scriptName('sfs')
  .usage('Usage: $0 <command> [options]')
  .command('admin', 'admin commmands',
    (yargs) => {
      yargs
        .option('adminpass', {
          demandOption: true,
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
            if (!verifyAdmin(args.adminpass as string)) throw "incorrect admin password"
            await createUser(client, args.user as string, args.pass as string, '')
          }
        )
    },
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
    (args) => {
      fs.readdirSync(pwd, {
        withFileTypes: true
      }).forEach((file) => {
        console.log(file.isDirectory() ? "/" + file.name : file.name)
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
    (args) => {
      process.chdir(path.join(pwd))
      if (!fs.existsSync(args.dir as string) && args.dir) {
        fs.mkdirSync(args.dir as string)
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
    (args) => {
      process.chdir(path.join(pwd))
      if (!fs.existsSync(args.file as string) && args.file) {
        fs.writeFileSync(args.file as string, '')
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
  .recommendCommands()
  .strictCommands()
  .demandCommand()
  .help('h')
  .alias('h', 'help')
  .parse()