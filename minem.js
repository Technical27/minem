#!/usr/bin/env node
'use strict';

const winston = require('winston');
const chalk = require('chalk');
const cli = require('commander');
const Promise = require('bluebird');

const path = require('path');
const fs = Promise.promisifyAll(require('fs'));

const logger = winston.createLogger({
  transports: new winston.transports.Console(),
  format: winston.format.printf(log => {
    switch (log.level) {
      case 'info':
        return `${chalk.bgBlack.bold.yellow(log.level)}: ${log.message}`;
      case 'error':
        return `${chalk.bgBlack.bold.redBright(log.level)}: ${chalk.underline(log.message)}`;
      default:
        return `${log.level}: ${log.message}`;
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

cli.version('1.1.6', '-v, --version');

cli
  .command('init')
  .description('creates a minem.json at the current directory')
  .action(() => {
    logger.log('info', 'creating minem.json');
    fs.writeFileAsync('minem.json', defaultConfig)
      .then(() => {
        logger.log('info', 'creating server directory');
        return fs.mkdirAsync('server');
      })
      .then(() => {
        logger.log('info', 'creating eula.txt');
        return fs.writeFileAsync(path.join('server', 'eula.txt'), 'eula=true');
      })
      .catch(e => logger.log('error', e));
  });

cli
  .command('download <version>')
  .alias('get')
  .description('downloads minecraft server version <version>, use \'latest\' as version to download the latest version and \'latest-snapshot\' for the latest snapshot version')
  .action(require('./download')(logger));

cli
  .command('start')
  .description('starts a minecraft server using config info from minem.json, use -d to run from background')
  .option('-d,--detach', 'runs server in background')
  .action(require('./start')(logger));

cli.parse(process.argv);
