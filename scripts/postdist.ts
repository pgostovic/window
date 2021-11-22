import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')).toString());

const {
  author,
  browser,
  dependencies,
  peerDependencies,
  description,
  engines,
  keywords,
  license,
  name: packageName,
  repository,
  version,
} = pkg;

const distPkgJSON = {
  author,
  browser,
  dependencies,
  peerDependencies,
  description,
  engines,
  keywords,
  license,
  main: 'index.js',
  module: 'index.es.js',
  'jsnext:main': 'index.es.js',
  name: packageName,
  repository,
  version,
};

fs.writeFileSync(path.resolve(__dirname, '../dist/package.json'), JSON.stringify(distPkgJSON, null, 2));

fs.copyFileSync(path.resolve(__dirname, '../README.md'), path.resolve(__dirname, '../dist/README.md'));
