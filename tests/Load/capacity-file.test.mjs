import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readBoundedJson } from '../../scripts/capacity-file.mjs';

test('bounded capacity JSON reader rejects oversized and malformed input', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'ubsc-capacity-'));
    context.after(async () => rm(directory, { recursive: true, force: true }));

    const valid = join(directory, 'valid.json');
    await writeFile(valid, '{"ok":true}', 'utf8');
    assert.deepEqual(await readBoundedJson(valid, 32, 'Fixture'), { ok: true });

    const oversized = join(directory, 'oversized.json');
    await writeFile(oversized, `{"value":"${'x'.repeat(40)}"}`, 'utf8');
    await assert.rejects(() => readBoundedJson(oversized, 32, 'Fixture'), /exceeds/);

    const malformed = join(directory, 'malformed.json');
    await writeFile(malformed, '{not-json}', 'utf8');
    await assert.rejects(() => readBoundedJson(malformed, 32, 'Fixture'), /valid JSON/);
});
