const Promise = require('bluebird');

const path = require('path');
const os = require('os');
const {spawn} = require('child_process');
const fs = Promise.promisifyAll(require('fs'));

const startServer = (logger, serverPath) => {
  if (!fs.existsSync(path.join(serverPath, 'minem.json'))) return logger.log('error', 'no minem.json was found, use \'minem init\' to create one');
  let config;
  fs.readFileAsync(path.join(serverPath, 'minem.json'), 'utf8')
    .then(cfg => {
      config = JSON.parse(cfg);
      if (!fs.existsSync(path.join(serverPath, config.serverDir, config.serverFile))) {
        return logger.log('error', `${config.serverFile} wasn't found, use 'minem download latest' to download the latest version`);
      }

      logger.log('info', 'starting server');
      const args = [`-Xmx${config.mem.max}`, `-Xms${config.mem.min}`, '-jar', `${config.serverFile}`, 'nogui'];
      const s = spawn('java', args, {cwd: path.join(serverPath, config.serverDir)});
      s.stdout.pipe(process.stdout);
      process.stdin.pipe(s.stdin);
      s.on('exit', c => {
        logger.log('info', `server exited with code ${c}`);
        process.exit();
      });
    });
};

module.exports = logger => name => {
  if (name) {
    fs.readFileAsync(path.join(os.homedir(), '.minem.json'))
      .then(file => {
        const globalConfig = JSON.parse(file);
        const server = globalConfig.servers.find(s => s.name === name);
        startServer(logger, server.path);
      });
  }
  else {
    startServer(logger, process.cwd());
  }
};
