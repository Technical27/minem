const Promise = require('bluebird');
const chalk = require('chalk');

const path = require('path');
const os = require('os');
const fs = Promise.promisifyAll(require('fs'));

module.exports = logger => () => {
  const globalConfigPath = path.join(os.homedir(), '.minem.json');
  fs.readFileAsync(globalConfigPath)
    .then(data => {
      const globalConfig = JSON.parse(data);
      for (const server of globalConfig.servers) {
        const {name, path, status} = server;
        logger.log('info', `name: ${chalk.bold(name)}, path: ${chalk.bold(path)}, status: ${status == 'online' ? chalk.green(status) : chalk.red(status)}`);
      }
    });
};
