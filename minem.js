#!/usr/bin/env node
'use strict';

const winston = require('winston');
const chalk = require('chalk');
const fetch = require('node-fetch');
const cli = require('commander');
const shell = require('shelljs');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const fileHash = (path, hash) => {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash(hash);
    const stream = fs.createReadStream(path);
    stream.on('data', chunk => sum.update(chunk));
    stream.on('error', e => reject(`Hash error: ${e}`));
    stream.on('end', () => resolve(sum.digest('hex')));
  });
};

const defaultconfig = `{
  "serverFile": "server.jar",
  "serverDir": "server",
  "startFile": "start.js",
  "mem": {
    "min": "1G",
    "max": "2G"
  },
  "args": [],
  "javaArgs": []
}`;

cli.version('1.1.2', '-v, --version');

cli
  .command('init')
  .description('creates a minem.json at the current directory')
  .action(() => {
    logger.log('info', 'creating minem.json');
    new shell.ShellString(defaultconfig).to('minem.json');

    logger.log('info', 'creating server directory');
    shell.mkdir('server');

    logger.log('info', 'creating eula.txt');
    new shell.ShellString('eula=true').to(path.join('server', 'eula.txt'));
  });

cli
  .command('download <version>')
  .alias('get')
  .description('downloads minecraft server version <version>, use \'latest\' as version to download the latest version and \'latest-snapshot\' for the latest snapshot version')
  .action(version => {
    if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found in the current directory, use \'minem init\' to create one');

    const config = JSON.parse(shell.cat('minem.json'));

    if (!fs.existsSync(config.serverDir)) shell.mkdir(config.serverDir);

    fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')
      .then(x => x.json())
      .then(manifest => {
        const {versions} = manifest;

        if (version === 'latest') version = manifest.latest.release;
        else if (version === 'latest-snapshot') version = manifest.latest.snapshot;

        let versionlink;
        for (const v of versions) if (v.id === version) versionlink = v.url;

        if (!versionlink) return logger.log('error', 'unable to find minecraft version');

        fetch(versionlink)
          .then(x => x.json())
          .then(v => {
            if (!v.downloads.server) return logger.log('error', `unable to find a server download for version ${version}`);

            const downloadlink = v.downloads.server.url;

            logger.log('info', `downloading minecraft server version ${version} as ${config.serverFile}`);

            fetch(downloadlink)
              .then(x => {
                const tmp = shell.tempdir().toString();
                const file = fs.createWriteStream(path.join(tmp, 'server-tmp.jar'));
                x.body.pipe(file);
                x.body.on('end', () => {
                  file.close();
                  fileHash(path.join(tmp, 'server-tmp.jar'), 'sha1')
                    .then(hash => {
                      const expectedHash = v.downloads.server.sha1;
                      if (hash !== expectedHash) {
                        logger.log('error', `expected server hash to equal ${expectedHash}, but got ${hash}`);
                        return shell.rm(path.join(tmp, 'server-tmp.jar'));
                      }
                      logger.log('info', 'server hash verified');
                      shell.cp(path.join(tmp, 'server-tmp.jar'), path.join(config.serverDir, config.serverFile));
                      shell.rm(path.join(tmp, 'server-tmp.jar'));
                    })
                    .catch(e => {
                      logger.log('error', `unable to verify server hash: ${e}`);
                      return shell.rm(path.join(tmp, 'server-tmp.jar'));
                    });
                });
              })
              .catch(e => logger.log('error', `error while downloading minecraft server: ${e}`));
          })
          .catch(e => logger.log('error', `error while getting version data: ${e}`));
      })
      .catch(e => logger.log('error', `error while getting version manifest: ${e}`));
  });

cli
  .command('start')
  .description('starts a minecraft server using config info from minem.json')
  .action(() => {
    if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found, use \'minem init\' to create one');
    const config = JSON.parse(shell.cat('minem.json'));

    if (!fs.existsSync(path.join(config.serverDir, config.serverFile))) return logger.log('error', `${config.serverFile} wasn't found, use 'minem download latest' to download the latest version`);

    const java = shell.which('java');

    if (!java) return logger.log('error', 'java wasn\'t found on PATH, please make sure it is on PATH');

    logger.log('info', 'starting server');

    const s = shell.exec(`'${java}' -Xmx${config.mem.max} -Xms${config.mem.min} ${config.javaArgs.join(' ')} -jar ${config.serverFile} nogui ${config.args.join(' ')}`, {async: true, cwd: config.serverDir});

    s.stdout.pipe(process.stdout);
    process.stdin.pipe(s.stdin);
    s.on('exit', c => {
      logger.log('info', `server exited with code ${c}`);
      process.exit();
    });
  });

cli
  .command('config <setting> [value]')
  .description('changes <setting> in server.properties to [value], if [value] is ommitted, then the value for <setting> is removed or use -l or --list to list the value for <setting>')
  .option('-l,--list', 'lists <setting>')
  .action((setting, value, options) => {
    if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found in the current directory, use \'minem init\' to create one');
    const config = JSON.parse(shell.cat('minem.json'));
    if (!value) value = '';

    const [, v] = shell.cat(path.join(config.serverDir, 'server.properties')).grep(setting).replace(/\n/, '').split('=');

    if (options.list) return logger.log('info', `setting ${setting} has the value '${v}'`);
    shell.sed('-i', v, value, path.join(config.serverDir, 'server.properties'));
    logger.log('info', `setting ${setting} now has value '${value}'`);
  });

cli.parse(process.argv);