import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { INNERHTML_ALLOWLIST } from './lib/innerhtml_allowlist.mjs';

const RISKY_INTERPOLATION =
    /\.innerHTML\s*=\s*`[^`]*\$\{(?!.*\b(escapeHtml|safeHtml)\b)/;

async function collectJsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectJsFiles(fullPath)));
        } else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

function reportMismatch(actual, expected) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    const added = actualKeys.filter((key) => !expectedKeys.includes(key));
    const removed = expectedKeys.filter((key) => !actualKeys.includes(key));
    const changed = expectedKeys.filter((key) => actual[key] !== expected[key]);

    for (const key of added) {
        console.error(`[innerhtml-escape] unexpected innerHTML usage in ${key} (${actual[key]})`);
    }
    for (const key of removed) {
        console.error(`[innerhtml-escape] missing reviewed file ${key} (expected ${expected[key]})`);
    }
    for (const key of changed) {
        console.error(
            `[innerhtml-escape] innerHTML count drift in ${key}: expected ${expected[key]}, got ${actual[key]}`
        );
    }
}

let failed = false;

const moduleRoot = resolve(process.cwd(), 'assets/modules');
const files = await collectJsFiles(moduleRoot);
const actual = {};

for (const file of files) {
    const source = await readFile(file, 'utf8');
    const count = (source.match(/\binnerHTML\b/g) || []).length;
    if (!count) continue;
    const relativePath = relative(process.cwd(), file).replaceAll('\\', '/');
    actual[relativePath] = count;
}

const allowlistKeys = Object.keys(INNERHTML_ALLOWLIST).sort();
const actualKeys = Object.keys(actual).sort();
if (
    JSON.stringify(actualKeys) !== JSON.stringify(allowlistKeys) ||
    allowlistKeys.some((key) => actual[key] !== INNERHTML_ALLOWLIST[key])
) {
    reportMismatch(actual, INNERHTML_ALLOWLIST);
    failed = true;
}

for (const [relativePath] of Object.entries(actual)) {
    if (INNERHTML_ALLOWLIST[relativePath]) continue;
    const absolutePath = resolve(process.cwd(), relativePath);
    const source = await readFile(absolutePath, 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
        if (!line.includes('innerHTML')) return;
        if (line.includes("innerHTML = ''") || line.includes('innerHTML = ""')) return;
        if (line.includes('escapeHtml') || line.includes('safeHtml')) return;
        if (RISKY_INTERPOLATION.test(line)) {
            console.error(
                `[innerhtml-escape] unescaped template interpolation at ${relativePath}:${index + 1}`
            );
            failed = true;
        }
    });
}

if (failed) {
    process.exitCode = 1;
    throw new Error('innerHTML escape audit failed');
}

console.log('[innerhtml-escape] OK');