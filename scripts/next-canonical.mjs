// Runs the Next CLI from the folder's canonical on-disk spelling.
//
// Windows paths are case-insensitive: this project can be entered as `...\shiftgrid` while the folder is
// really `...\SHIFTGRID`. Next then loads its own modules under both spellings, which duplicates
// `workAsyncStorage`, and every prerender (even `/_global-error`) fails with
// "Invariant: Expected workStore to be initialized". Starting from the real spelling avoids it.
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root = realpathSync.native(process.cwd())
const require = createRequire(join(root, 'package.json'))
const nextBin = join(dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next')

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
