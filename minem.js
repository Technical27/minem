#!/usr/bin/env node
'use strict';

const winston = require('winston');
const chalk = require('chalk');
const cli = require('commander');
const Promise = require('bluebird');

const os = require('os');
const path = require('path');
const fs = Promise.promisifyAll(require('fs'));

const logger = winston.createLogger({
  transports: new winston.transports.Console(),
  format: winston.format.printf(log => {
    switch (log.level) {
      case 'info':
        return chalk.bgBlack(`${chalk.bold.yellow(log.level)}: ${log.message}`);
      case 'error':
        return chalk.bgBlack(`${chalk.bold.redBright(log.level)}: ${chalk.underline(log.message)}`);
      default:
        return chalk.bgBlack(`${log.level}: ${log.message}`);
    }
  })
});

const defaultConfig = `{
  "serverFile": "server.jar",
  "serverDir": "server",
  "mem": {
    "min": "1G",
    "max": "2G"
  }
}`;

const globalConfigPath = path.join(os.homedir(), '.minem.json');

if (!fs.existsSync(globalConfigPath)) {
  fs.writeFileSync(globalConfigPath, '{}');
}

cli.version('1.1.6', '-v, --version');

cli
  .command('init')
  .description('creates a minem.json at the current directory')
  .action(() => {
    logger.log('info', 'creating minem.json');
    fs.writeFileAsync('minem.json', defaultConfig)
      .then(() => {
        logger.log('info', 'creating server directory');
        if (!fs.existsSync('server')) return fs.mkdirAsync('server');
      })
      .then(() => {
        logger.log('info', 'creating eula.txt');
        logger.log('info', '(you agree to this): https://account.mojang.com/documents/minecraft_eula');
        return fs.writeFileAsync(path.join('server', 'eula.txt'), 'eula=true');
      })
      .then(() => {
        return fs.readFileAsync(globalConfigPath);
      })
      .then(file => {
        const globalConfig = JSON.parse(file);
        if (!globalConfig.servers) globalConfig.servers = [];

        const name = path.basename(process.cwd());
        if (!globalConfig.servers.some(s => s.name === name)) {
          globalConfig.servers.push({name, path: process.cwd(), status: 'offline'});
          return fs.writeFileAsync(globalConfigPath, JSON.stringify(globalConfig));
        }
      })
      .catch(e => logger.log('error', e));
  });

cli
  .command('download <version>')
  .alias('get')
  .description('downloads minecraft server version <version>, use \'latest\' as version to download the latest version and \'latest-snapshot\' for the latest snapshot version')
  .action(require('./download')(logger));

cli
  .command('start [name]')
  .description('starts a minecraft server in the current directory or starts [name]')
  .action(require('./start')(logger));

cli
  .command('server')
  .description('manages a global list of servers')
  .action(require('./server')(logger));

cli.parse(process.argv);
