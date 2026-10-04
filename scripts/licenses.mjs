import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const notices = [];
async function scan(root) {
  let entries; try { entries = await readdir(root,{ withFileTypes:true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(root,entry.name);
    if (entry.name.startsWith('@')) { await scan(dir); continue; }
    let pkg; try { pkg = JSON.parse(await readFile(path.join(dir,'package.json'),'utf8')); } catch { continue; }
    const files = (await readdir(dir)).filter(n => /^(license|licence|copying|notice)(\.|$)/i.test(n));
    let text = '';
    for (const file of files) {
      try { text += '\n' + await readFile(path.join(dir,file),'utf8'); } catch {}
    }
    notices.push('============================================================\n' + pkg.name + '@' + pkg.version + '\nDeclared license: ' + JSON.stringify(pkg.license || pkg.licenses || 'See package documentation') + '\n' + text);
    await scan(path.join(dir,'node_modules'));
  }
}
await scan('node_modules'); notices.sort();
await writeFile('docs/THIRD_PARTY_LICENSES.txt',notices.join('\n\n'),'utf8');
console.log('Collected license notices for ' + notices.length + ' installed packages.');
