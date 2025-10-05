#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';

const outDir = path.resolve('dist-pages');
const libDirs = [
    'add',
    'data',
    'ext',
    'geo',
    'kiri',
    'load',
    'main',
    'mesh',
    'moto',
    'pack',
    'wasm'
];

async function generateDevices() {
    const root = path.join('src', 'kiri', 'dev');
    const devs = {};

    const types = await fs.readdir(root);
    for (const type of types) {
        if (type.startsWith('.')) continue;
        const typePath = path.join(root, type);
        const stat = await fs.stat(typePath);
        if (!stat.isDirectory()) continue;

        const devices = {};
        const entries = await fs.readdir(typePath);
        for (const entry of entries) {
            if (entry.startsWith('.')) continue;
            const entryPath = path.join(typePath, entry);
            const entryStat = await fs.stat(entryPath);
            if (entryStat.isDirectory()) continue;

            const name = entry.endsWith('.json') ? entry.slice(0, -5) : entry;
            const data = await fs.readJson(entryPath);
            devices[name] = data;
        }

        if (Object.keys(devices).length) {
            devs[type] = devices;
        }
    }

    const packDir = path.join('src', 'pack');
    await fs.ensureDir(packDir);
    const outFile = path.join(packDir, 'kiri-devs.js');
    await fs.writeFile(outFile, `export const devices = ${JSON.stringify(devs)};\n`);
    console.log(`Device pack written to ${outFile}`);
}

async function buildStaticBundle() {
    console.log(`Preparing static bundle in ${outDir}`);

    await fs.emptyDir(outDir);

    // expose PWA assets (kiri, mesh, moto, fonts, etc)
    await fs.copy('web', outDir, { dereference: true });

    // copy library sources the web app expects under /lib
    await Promise.all(
        libDirs.map(async (dir) => {
            const srcPath = path.join('src', dir);
            const dstPath = path.join(outDir, 'lib', dir);
            if (await fs.pathExists(srcPath)) {
                await fs.copy(srcPath, dstPath, { dereference: true });
            }
        })
    );

    // redirect naked domain to /kiri/
    await fs.writeFile(
        path.join(outDir, 'index.html'),
        '<!doctype html><meta http-equiv="refresh" content="0;url=/kiri/">Redirecting…\n'
    );

    // replicate wasm assets where in-browser paths expect them
    const wasmSource = path.join('src', 'wasm');
    const wasmTargets = [
        path.join(outDir, 'wasm'),
        path.join(outDir, 'lib', 'wasm'),
        path.join(outDir, 'lib', 'kiri', 'wasm'),
        path.join(outDir, 'kiri', 'wasm'),
    ];
    if (await fs.pathExists(wasmSource)) {
        for (const target of wasmTargets) {
            await fs.ensureDir(target);
            await fs.copy(wasmSource, target, { dereference: true });
        }
    }

    // provide mesh-bvh sourcemap to silence 404 noise during development
    const maps = [
        {
            src: path.join('node_modules', 'three-mesh-bvh', 'build', 'index.module.js.map'),
            dst: path.join(outDir, 'lib', 'ext', 'index.module.js.map')
        },
        {
            src: path.join('node_modules', '@tracespace', 'parser', 'umd', 'parser.js.map'),
            dst: path.join(outDir, 'lib', 'ext', 'parser.js.map')
        }
    ];
    for (const { src, dst } of maps) {
        if (await fs.pathExists(src)) {
            await fs.ensureDir(path.dirname(dst));
            await fs.copyFile(src, dst);
        }
    }

    console.log('dist-pages ready');
}

async function main() {
    const args = new Set(process.argv.slice(2));

    await generateDevices();

    if (args.has('--prepare')) {
        return;
    }

    await buildStaticBundle();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
