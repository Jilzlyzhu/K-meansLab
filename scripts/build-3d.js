const esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
esbuild.buildSync({entryPoints:[path.join(root,'src/lab3d.js')],bundle:true,format:'iife',globalName:'Lab3D',minify:true,target:'es2020',outfile:path.join(root,'public/lab3d.bundle.js'),legalComments:'eof'});
fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(root,'public/THREE-LICENSE.txt'));
console.log('Three.js 三维视图已打包为本地文件。');
