import { Command } from 'commander';
import { existsSync, lstatSync } from 'fs';
import { sync as globSync } from 'glob';
import { createInterface } from 'readline';
import { sep } from 'path';
import { Deployer } from '@faasjs/deployer';
import { defaultsEnv } from '../helper';
import { cpus } from 'os';
import { fork } from 'cluster';
import { chunk } from 'lodash';

async function deploy (file) {
  try {
    const deployer = new Deployer({
      root: process.env.FaasRoot,
      filename: file
    });
    await deployer.deploy();
  } catch (error) {
    if (process.env.CI) throw error;

    console.error(error);
    console.warn(file + ' 部署失败，是否重试？');
    await new Promise<void>(function (resolve, reject) {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });
      readline.question('输入 y 确认:', function (res: string) {
        readline.close();

        if (res !== 'y') {
          console.error('不重试，继续部署后续函数');
          reject();
        } else
          resolve();
      });
    });
    await deploy(file);
  }
}

export async function action (env: string, files: string[], { w }: {w?: string}): Promise<void> {
  if (process.env.FaasDeployFiles) {
    for (const file of process.env.FaasDeployFiles.split(','))
      await deploy(file);
    process.exit();
  }

  process.env.FaasEnv = env;

  defaultsEnv();

  const list: string[] = [];

  for (const name of files) {
    let path = name.startsWith(sep) ? name : process.env.FaasRoot + name;

    if (!existsSync(path))
      throw Error(`File not found: ${path}`);

    if (lstatSync(path).isFile())
      list.push(path);
    else {
      if (!path.endsWith(sep))
        path += sep;

      list.push(...[...new Set(globSync(path + '*.func.ts').concat(globSync(path + `**${sep}*.func.ts`)))]);
    }
  }

  if (list.length < 1) throw Error('Not found files.');

  if (list.length === 1)
    await deploy(list[0]);
  else {
    let processNumber = w ? Number(w) : (cpus().length > 1 ? cpus().length - 1 : 1);
    if (processNumber > list.length) processNumber = list.length;

    console.log(`[${process.env.FaasEnv}] 是否要发布以下 ${list.length} 个云函数？(并行数 ${processNumber})`);
    console.log(list);
    console.log('');
    if (!process.env.CI)
      await new Promise<void>(function (resolve, reject) {
        const readline = createInterface({
          input: process.stdin,
          output: process.stdout
        });
        readline.question('输入 y 确认:', function (res: string) {
          readline.close();

          if (res !== 'y') {
            console.error('停止发布');
            reject();
          } else
            resolve();
        });
      });

    if (processNumber === 1) {
      for (const file of list)
        await deploy(file);
      return;
    }

    const files = chunk(list, Math.ceil(list.length / processNumber));
    for (let i = 0; i < processNumber; i++) {
      if (!files[i] || !files[i].length) continue;
      const worker = fork({ FaasDeployFiles: files[i] });
      worker.on('error', function () {
        worker.kill();
      });
    }
  }
}

export default function (program: Command): void {
  program
    .command('deploy <env> [files...]')
    .option('-w <workers>', '并行发布的数量，默认为 CPU 数量 - 1')
    .name('deploy')
    .description('发布')
    .on('--help', function () {
      console.log(`
Examples:
  yarn deploy staging services${sep}demo.func.ts
  yarn deploy production services${sep}demo.func.ts services${sep}demo2.func.ts
  yarn deploy staging services${sep}`);
    })
    .action(action);
}
