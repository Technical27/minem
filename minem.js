#!/usr/bin/env node
'use strict';

const winston = require('winston');
const chalk = require('chalk');
const fetch = require('node-fetch');
const cli = require('commander');
const replace = require('replace-in-file');

const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

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

cli.version('1.1.0', '-v, --version');

cli
  .command('init [dir]')
  .description('creates a minem.json at [dir] or the current directory')
  .action(dir => {
    dir = dir || '.';
    logger.log('info', 'creating minem.json');
    fs.writeFileSync(path.join(dir, 'minem.json'), defaultconfig);

    logger.log('info', 'creating server directory');
    fs.mkdirSync(path.join(dir, 'server'));

    logger.log('info', 'creating eula.txt');
    fs.writeFileSync(path.join(dir, 'server', 'eula.txt'), 'eula=true');
  });

cli
  .command('download <version>')
  .alias('get')
  .description('downloads minecraft server version <version>, use \'latest\' as version to download the latest version and \'latest-snapshot\' for the latest snapshot version')
  .action(version => {
    if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found in the current directory, use \'minem init\' to create one');

    if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir);

    const config = JSON.parse(fs.readFileSync('minem.json', 'utf8'));

    fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json')
      .then(x => x.json())
      .then(manifest => {
        const {versions} = manifest;

        if (version === 'latest') version = manifest.latest.release;
        else if (version === 'latest-snapshot') version = manifest.latest.snapshot;

        let versionlink;
        for (const v of versions) if (v.id === version) versionlink = v.url;

        if (!versionlink) return logger.log('error', 'unable to find minecraft server version');

        fetch(versionlink)
          .then(x => x.json())
          .then(x => {
            const downloadlink = x.downloads.server.url;
            if (!downloadlink) return logger.log('error', 'unable to find a server download for this minecraft version');

            logger.log('info', `downloading minecraft server version ${version} as ${config.serverFile}`);

            const file = fs.createWriteStream(path.join(config.serverDir, config.serverFile));
            fetch(downloadlink)
              .then(x => x.body.pipe(file))
              .catch(err => logger.log('error', `error while downloading minecraft server: ${err}`));
          })
          .catch(err => logger.log('error', `error while getting version data: ${err}`));
      })
      .catch(err => logger.log('error', `error while getting version manifest: ${err}`));
  });

cli
  .command('start')
  .description('starts a minecraft server using config info from minem.json')
  .action(() => {
    if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found in the current directory, use \'minem init\' to create one');

    const config = JSON.parse(fs.readFileSync('minem.json', 'utf8'));
    logger.log('info', 'starting server');
    const s = spawn('java', [`-Xmx${config.mem.max}`, `-Xms${config.mem.min}`, ...config.javaArgs, '-jar', config.serverFile, 'nogui', ...config.args], {cwd: config.serverDir});
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
    const config = JSON.parse(fs.readFileSync('minem.json', 'utf8'));
    if (!fs.existsSync(path.join(config.serverDir, 'server.properties'))) return logger.log('error', `no server.properties file was found at ${config.serverDir}, use 'minem start' to start the server to create server.properties`);

    let line = '';
    const serverProps = fs.readFileSync(path.join(config.serverDir, 'server.properties'), 'utf8').trim().split(/\r?\n/g);
    for (const prop of serverProps) {
      if (prop[0] === '#') continue;
      const match = prop.match(/(?<setting>[0-9a-z-.]+)=(?<value>[0-9a-z ]+)?/i).groups;
      if (match.setting === setting) {
        if (options.list) {
          if (match.value) return logger.log('info', `${setting} has the value: ${match.value}`);
          return logger.log('info', `${setting} has no value`);
        }
        else line = prop;
      }
    }
    if (options.list || line === '') return logger.log('error', `unable to find setting ${setting} in server.properties`);

    replace({
      files: path.join(config.serverDir, 'server.properties'),
      from: line,
      to: `${setting}=${value}`
    });
  });

cli.parse(process.argv);