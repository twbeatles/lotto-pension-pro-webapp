import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const TARGETS = [
    {
        path: 'assets/modules/features/pension720/dom.js',
        required: ['빠름', '기본', '정밀', '조 ']
    },
    {
        path: 'assets/modules/utils/strings.js',
        required: ['백업', '동기화']
    }
];

const CORRUPTION_PATTERNS = [
    /label:\s*'\?\?'/,
    /String\(options\.group\)\s*\+\s*'\?'/,
    /\}\?\s\$\{String\(ticket/
];

let failed = false;

for (const target of TARGETS) {
    const absolutePath = resolve(process.cwd(), target.path);
    const source = await readFile(absolutePath, 'utf8');

    for (const snippet of target.required) {
        if (!source.includes(snippet)) {
            console.error(`[utf8-korean] missing required text "${snippet}" in ${target.path}`);
            failed = true;
        }
    }

    for (const pattern of CORRUPTION_PATTERNS) {
        if (pattern.test(source)) {
            console.error(`[utf8-korean] corruption pattern ${pattern} found in ${target.path}`);
            failed = true;
        }
    }
}

if (failed) {
    process.exitCode = 1;
    throw new Error('UTF-8 Korean integrity check failed');
}

console.log('[utf8-korean] OK');