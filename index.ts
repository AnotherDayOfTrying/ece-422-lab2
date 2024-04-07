#!/usr/bin/env bun
import os from "os"
import sqlite3 from "sqlite3";
import yargs, { string } from "yargs"
import fs from "fs"
import { cwd } from "process";
import path from "path";
import crypto from 'crypto';

const algorithm = 'aes-256-ctr';
const password = 'password'; 
const secretKey = crypto.createHash('sha256').update(String(password)).digest('base64').substr(0, 32);
const iv = crypto.randomBytes(16);

const encrypt = (buffer: Buffer): Buffer => {
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  return result;
};

const decrypt = (encrypted: Buffer): Buffer => {
  const iv = encrypted.slice(0, 16);
  const data = encrypted.slice(16);
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  const result = Buffer.concat([decipher.update(data), decipher.final()]);
  return result;
};

let db = new sqlite3.Database('./test.db', (err) => {
  if (err) {
    console.error(err.message);
  }
});

const pwd = "./file_system/" + fs.readFileSync("./pwd")

yargs(process.argv.slice(2))
  .env('sfs')
  .scriptName('sfs')
  .usage('Usage: $0 <command> [options]')
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
  .command('encrypt [file]', 'encrypt a file', 
    (yargs) => {
      yargs.positional('file', {
        describe: 'file to encrypt',
        default: '',
        type: 'string'
      });
    },
    (args) => {
      process.chdir(path.join(pwd))
      if (fs.existsSync(args.file as string)) {
        const fileContent = fs.readFileSync(args.file);
        const encryptedContent = encrypt(fileContent);
        fs.writeFileSync(args.file, encryptedContent);
        console.log(`File encrypted: ${args.file}`);
      } else {
        console.log('File not found');
      }
    })
    .command('decrypt [file]', 'decrypt a file',
    (yargs) => {
      yargs.positional('file', {
        describe: 'file to decrypt',
        type: 'string',
        demandOption: true,
      });
    },
    (args) => {
      process.chdir(path.join(pwd))
      if (fs.existsSync(args.file)) {
        const fileContent = fs.readFileSync(args.file);
        try {
          const decryptedContent = decrypt(fileContent);
          fs.writeFileSync(args.file, decryptedContent);
          console.log(`File decrypted: ${args.file}`);
        } catch (error) {
          console.log('Failed to decrypt file. It may have been altered or is not encrypted.');
        }
      } else {
        console.log('File not found');
      }
    })
  .recommendCommands()
  .strictCommands()
  .demandCommand()
  .help('h')
  .alias('h', 'help')
  .parse()
