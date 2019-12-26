const Promise = require('bluebird');
const path = require('path');
const {spawn} = require('child_process');
const fs = Promise.promisifyAll(require('fs'));

module.exports = logger => options => {
  if (!fs.existsSync('minem.json')) return logger.log('error', 'no minem.json was found, use \'minem init\' to create one');
  let config;
  fs.readFileAsync('minem.json', 'utf8')
    .then(cfg => {
      config = JSON.parse(cfg);
      if (!fs.existsSync(path.join(config.serverDir, config.serverFile))) {
        return logger.log('error', `${config.serverFile} wasn't found, use 'minem download latest' to download the latest version`);
      }

      logger.log('info', 'starting server');
      const args = [`-Xmx${config.mem.max}`, `-Xms${config.mem.min}`, '-jar', `${config.serverFile}`, 'nogui'];
      if (options.detach) {
        const s = spawn('java', args, {detached: true, cwd: config.serverDir, stdio: 'ignore'});
        s.unref();
      }
      else {
        const s = spawn('java', args, {cwd: config.serverDir});
        s.stdout.pipe(process.stdout);
        process.stdin.pipe(s.stdin);
        s.on('exit', c => {
          logger.log('info', `server exited with code ${c}`);
          process.exit();
        });
      }
    });
};
