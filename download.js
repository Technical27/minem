const axios = require('axios');
const Promise = require('bluebird');
const progress = require('progress');
const chalk = require('chalk');

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = Promise.promisifyAll(require('fs'));

const fileHash = (path, hash) => {
  return new Promise((resolve, reject) => {
    const sum = crypto.createHash(hash);
    const stream = fs.createReadStream(path);
    stream.on('data', chunk => sum.update(chunk));
    stream.on('error', e => reject(`Hash error: ${e}`));
    stream.on('end', () => resolve(sum.digest('hex')));
  });
};

module.exports = logger => version => {
  if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found in the current directory, use \'minem init\' to create one');

  let config, serverHash;

  fs.readFileAsync('minem.json', 'utf8')
    .then(data => {
      config = JSON.parse(data);
      if (!fs.existsSync(config.serverDir)) fs.mkdirSync(config.serverDir);
      return axios('https://launchermeta.mojang.com/mc/game/version_manifest.json');
    })
    .then(({data: manifest}) => {
      const {versions} = manifest;

      if (version === 'latest') version = manifest.latest.release;
      else if (version === 'latest-snapshot') version = manifest.latest.snapshot;

      let versionLink;
      for (const v of versions) if (v.id === version) versionLink = v.url;

      if (!versionLink) return logger.log('error', 'unable to find minecraft version');

      return axios(versionLink)
    })
    .then(({data: v}) => {
      if (!v.downloads.server) return logger.log('error', `unable to find a server download for version ${version}`);

      const downloadlink = v.downloads.server.url;
      serverHash = v.downloads.server.sha1;

      logger.log('info', `downloading minecraft server version ${version} as ${config.serverFile}`);

      return axios(downloadlink, {responseType: 'stream'});
    })
    .then(({data, headers}) => {
      const length = parseInt(headers['content-length']);
      const bar = new progress(`${chalk.bgBlack.bold.yellow('info')}: [:bar] :percent`, {
        complete: '=',
        incomplete: ' ',
        head: '>',
        width: '50',
        total: length
      });
      const tmp = os.tmpdir();
      const file = fs.createWriteStream(path.join(tmp, 'server-tmp.jar'));
      data.pipe(file);
      data.on('data', d => bar.tick(d.length));
      data.on('end', () => {
        file.close();
        fileHash(path.join(tmp, 'server-tmp.jar'), 'sha1')
          .then(hash => {
            if (hash !== serverHash) {
              logger.log('error', `expected server hash to equal ${serverHash}, but got ${hash}`);
              return fs.unlinkSync(path.join(tmp, 'server-tmp.jar'));
            }
            logger.log('info', 'server hash verified');
            fs.copyFileSync(path.join(tmp, 'server-tmp.jar'), path.join(config.serverDir, config.serverFile));
            fs.unlinkSync(path.join(tmp, 'server-tmp.jar'));
          })
          .catch(e => {
            logger.log('error', `unable to verify server hash: ${e}`);
            fs.unlinkSync(path.join(tmp, 'server-tmp.jar'));
          });
      });
    })
    .catch(e => logger.log('error', `error while downloading server: ${e}`));
};
